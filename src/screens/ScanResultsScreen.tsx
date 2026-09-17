/**
 * The report for one capture.
 *
 * A vision capture arrives with a fresh on-device model result attached, and
 * every figure below is derived from it: the verdict is the model's own class in
 * plain language, the advice is the recommendation that shipped with the model,
 * and the gauge reads the defect share computed from its counts. The acoustic
 * compatibility route displays the latest immutable probe-backed classification;
 * new acoustic events are filed automatically by the inbox processor. Vision
 * never falls back to stored/demo values: without a fresh model result, this
 * screen refuses to present or save a scan.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { ProportionBar } from '../components/ProportionBar';
import { Screen } from '../components/Screen';
import { StatusMark } from '../components/StatusMark';
import { ThresholdBar } from '../components/ThresholdBar';
import { TickGauge } from '../components/TickGauge';
import { Waveform } from '../components/Waveform';

import { ago, bandColor, percent } from '../core/format';
import { ACOUSTIC_CLASS_LABEL } from '../core/acoustic';
import {
  BAND_LABEL,
  acousticBand,
  acousticScore,
  bandFromScore,
  LIMITS,
  scoreOf,
  totalDamagePercent,
  visionDefects,
} from '../core/monitoring';
import { colors, gutter, space, tabular, type } from '../core/theme';
import {
  BEAN_LEVELS,
  CONFIDENCE_FLOOR,
  labelFor,
  MODEL_NAME,
  visualCountsForHistory,
  type VisualScanResult,
} from '../services/visualScanService';
import { useFacilityStore, useSilo } from '../state/facilityStore';

/**
 * Commercial grade bands by share of the sample showing defects. Stated
 * explicitly on screen, because a grade nobody can audit is worth nothing to
 * the person deciding whether to sell or re-dry a lot.
 */
const GRADES = [
  { code: 'Grade 1', max: 2, note: 'Premium — long-term storage' },
  { code: 'Grade 2', max: 5, note: 'Standard commercial sale' },
  { code: 'Grade 3', max: 10, note: 'Feed and processing only' },
  { code: 'Off-grade', max: Infinity, note: 'Not fit to store' },
];

/**
 * The one-line description stored with a detection. The counts sit in the log
 * row beside it, so this records the model verdict without repeating figures
 * the reader can already see.
 */
export default function ScanResultsScreen({ navigation, route }: any) {
  const siloId = route?.params?.siloId;
  const mode = route?.params?.mode === 'acoustic' ? 'acoustic' : 'vision';
  const visualResult = route?.params?.visualResult as
    | VisualScanResult
    | undefined;
  const silo = useSilo(siloId);

  const saveVisionScan = useFacilityStore(s => s.saveVisionScan);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const storedVision = silo.vision;
  const mapped = visualResult ? visualCountsForHistory(visualResult) : null;
  const vision = visualResult
    ? {
        sampleSize: visualResult.sampleSize,
        ...mapped!,
        confidence: visualResult.confidence,
        model: MODEL_NAME,
        minutesAgo: 0,
      }
    : storedVision;
  const acoustic = silo.acoustic;

  if (mode === 'vision' && !visualResult) {
    return (
      <Screen>
        <AppBar
          eyebrow={`Vision scan · ${silo.code}`}
          title="Result unavailable"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.body}>
          <View style={styles.notice}>
            <Notice
              tone="critical"
              title="No analysis result"
              detail="No fresh model output was supplied for this photo. Return to the scanner and analyse the image again; no stored or demo values have been substituted."
            />
          </View>
        </View>
      </Screen>
    );
  }

  const damage = totalDamagePercent(vision);
  const defects = visionDefects(vision);
  const gradeIndex = GRADES.findIndex(g => damage <= g.max);

  const score =
    mode === 'vision'
      ? scoreOf(damage, 'damagePercent')
      : acousticScore(acoustic.probabilityInfested) ?? 0;
  const band =
    mode === 'vision' ? bandFromScore(score) : acousticBand(acoustic);

  // ── What to tell the farmer, in the model's own terms ──────────────────
  // Beans are read as several views of one heap; the grain crops are analysed
  // per kernel. Only the per-kernel route gets a commercial grade and a defect
  // breakdown, because those bands are defined on kernel counts. A stored
  // acoustic mode does not use this flag. Every vision report reaching this
  // point has a fresh result because the guard above rejects missing output.
  const perKernel = visualResult?.route !== 'direct';
  const extent = visualResult?.extent ?? null;

  // The headline is the model's own prediction, in plain language. One guard:
  // a per-kernel sample can read "sound" by plurality while its total defect
  // share still fails the grade, so in that case we lead with the largest
  // defect instead — the result must never reassure about a lot that failed.
  const worstDefect = defects.reduce(
    (worst, d) => (d.count > worst.count ? d : worst),
    defects[0],
  );
  const defectLead =
    perKernel &&
    visualResult?.clean === true &&
    band !== 'ok' &&
    worstDefect.count > 0;
  const verdictLabel = !visualResult
    ? null
    : defectLead
    ? worstDefect.label
    : visualResult.predictionLabel;
  const verdictColor =
    visualResult?.clean && !defectLead ? colors.ok : bandColor(band).line;
  const verdictDetail = !visualResult
    ? null
    : defectLead
    ? `${percent(worstDefect.percent)} of the ${
        vision.sampleSize
      }-kernel sample shows ${worstDefect.label.toLowerCase()}, past the grading tolerance.`
    : extent && extent.infestedViews > 0
    ? `${extent.infestedViews} of ${extent.views} views of the heap show weevil damage. ${extent.note}`
    : visualResult.advice;

  /**
   * What to do next. The model ships its own recommendation per class, so that is
   * what a fresh scan shows. Two exceptions fall back to the band-derived line:
   * a plurality-sound sample that failed on total defect share would otherwise
   * be handed "sound grain" advice about a lot that just failed its grade.
   */
  const nextStep =
    mode === 'vision' && visualResult && !defectLead
      ? visualResult.advice
      : advice(mode, band, silo.crop);

  /**
   * Writes the reading on screen into the silo's history. The service promotes
   * it to the silo's current reading in the same batch, so the dashboard cannot
   * end up quoting an older figure than the report just filed. Filing twice
   * would enter the same reading twice, so the button closes on success.
   */
  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    setFailure(null);

    if (mode === 'acoustic') {
      setSaving(false);
      setSaved(true);
      return;
    }

    const message = await saveVisionScan({
      siloId: silo.id,
      label: `${silo.crop} · handheld capture`,
      sampleSize: vision.sampleSize,
      boreHoles: vision.boreHoles,
      discoloration: vision.discoloration,
      fragmentation: vision.fragmentation,
      mould: vision.mould,
      confidence: vision.confidence,
      model: vision.model,
      crop: visualResult?.crop,
      route: visualResult?.route,
      prediction: visualResult?.prediction,
      advice: visualResult?.advice,
      classCounts: visualResult?.counts,
      lowTrust: visualResult?.lowTrust,
      crossCheck: visualResult?.crossCheck?.code,
      extentPercent: extent?.percent,
      severity: extent?.severity,
    });

    setSaving(false);
    if (message) {
      setFailure(message);
      return;
    }
    setSaved(true);
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label={
              mode === 'acoustic'
                ? 'Filed automatically'
                : saved
                ? 'Filed to log'
                : 'Save to log'
            }
            icon={mode === 'acoustic' || saved ? 'check' : 'save'}
            loading={saving}
            disabled={mode === 'acoustic' || saved}
            onPress={() => {
              save();
            }}
            style={styles.grow}
          />
          <Button
            label="Scan again"
            icon="rotate-ccw"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.grow}
          />
        </View>
      }
    >
      <AppBar
        eyebrow={`${mode === 'vision' ? 'Vision scan' : 'Acoustic scan'} · ${
          silo.code
        }`}
        title="Result"
        onBack={() => navigation.goBack()}
        right={<StatusMark band={band} label={BAND_LABEL[band]} />}
      />

      <View style={styles.body}>
        {failure || saved ? (
          <View style={styles.notice}>
            {failure ? (
              <Notice
                tone="critical"
                title="Not filed"
                detail={failure}
                onDismiss={() => setFailure(null)}
              />
            ) : (
              <Notice
                tone="ok"
                title="Filed to the log"
                detail={
                  mode === 'vision'
                    ? `This scan is in ${silo.code}'s vision history and is now its current reading.`
                    : `This detection is in ${silo.code}'s log and is now its current acoustic reading.`
                }
              />
            )}
          </View>
        ) : null}

        <Panel style={styles.first}>
          <PanelHeader
            label={mode === 'vision' ? 'What the scan found' : 'Activity level'}
            icon={mode === 'vision' ? 'camera' : 'activity'}
            right={
              <Text style={styles.meta}>
                {ago(
                  mode === 'vision' ? vision.minutesAgo : acoustic.minutesAgo,
                )}
              </Text>
            }
          />

          {mode === 'vision' && verdictLabel ? (
            <View style={styles.verdict}>
              <View
                style={[styles.verdictRule, { backgroundColor: verdictColor }]}
              />
              <View style={styles.verdictMain}>
                <View style={styles.verdictHead}>
                  <Text style={[styles.verdictLabel, { color: verdictColor }]}>
                    {verdictLabel}
                  </Text>
                  {visualResult?.lowTrust ? (
                    <Text style={styles.lowTrust}>LOW TRUST</Text>
                  ) : null}
                </View>
                {verdictDetail ? (
                  <Text style={styles.verdictDetail}>{verdictDetail}</Text>
                ) : null}
                {visualResult?.lowTrust ? (
                  <Text style={styles.verdictWarn}>
                    Model certainty {percent(visualResult.confidence * 100, 0)},
                    below the {percent(CONFIDENCE_FLOOR * 100, 0)} the model is
                    trusted at. Confirm with a second photo before acting on
                    this reading.
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.gaugeWrap}>
            <TickGauge
              value={score}
              band={band}
              size={186}
              caption={
                mode === 'vision'
                  ? perKernel
                    ? GRADES[gradeIndex].code
                    : extent
                    ? extent.percent > 0
                      ? `${extent.label} infestation`
                      : 'No infestation'
                    : BAND_LABEL[band]
                  : BAND_LABEL[band]
              }
              footnote={
                mode === 'vision'
                  ? perKernel
                    ? `${percent(damage)} of ${
                        vision.sampleSize
                      } kernels affected`
                    : extent
                    ? `${extent.infestedViews} of ${extent.views} heap views affected`
                    : `model confidence ${percent(vision.confidence * 100, 0)}`
                  : acoustic.probabilityInfested == null
                  ? 'No probe-backed probability'
                  : `${percent(
                      acoustic.probabilityInfested * 100,
                      0,
                    )} infestation probability`
              }
            />
          </View>

          <Text style={styles.subject}>
            {silo.name} · {silo.crop}
          </Text>
        </Panel>

        {mode === 'vision' && visualResult ? (
          <Panel style={styles.block}>
            <PanelHeader
              label="Model finding"
              icon="cpu"
              right={<Text style={styles.meta}>{MODEL_NAME}</Text>}
            />
            <DataRow
              label="Grain"
              value={cap(visualResult.crop)}
              mono={false}
            />
            <DataRow
              label="Method"
              value={
                perKernel ? 'Per kernel' : `${vision.sampleSize} heap views`
              }
              mono={false}
            />
            <DataRow
              label={perKernel ? 'Most common class' : 'Prediction'}
              value={visualResult.predictionLabel}
              hint={visualResult.prediction}
              mono={false}
            />
            <DataRow
              label={perKernel ? 'Mean confidence' : 'Certainty'}
              value={percent(visualResult.confidence * 100, 0)}
              hint={
                visualResult.lowTrust
                  ? `below the ${percent(
                      CONFIDENCE_FLOOR * 100,
                      0,
                    )} trust floor`
                  : undefined
              }
              valueColor={
                visualResult.lowTrust ? bandColor('caution').line : undefined
              }
            />
            {visualResult.crossCheck ? (
              <DataRow
                label="Cross-check"
                value={visualResult.crossCheck.label}
                hint={`generic head · ${percent(
                  visualResult.crossCheck.confidence * 100,
                  0,
                )}`}
                mono={false}
              />
            ) : null}

            {extent ? (
              <>
                <Divider style={styles.rule} />
                <Text style={styles.scaleLabel}>Infestation level</Text>
                <Text style={styles.intro}>
                  The beans head answers whether a view of the heap shows weevil
                  damage, not how much. The level below is the share of views
                  that came back infested — a measured spread, not a reading of
                  the confidence figure above.
                </Text>
                <View style={styles.levelTable}>
                  {BEAN_LEVELS.map(level => {
                    const active = level.key === extent.severity;
                    return (
                      <View key={level.key} style={styles.gradeRow}>
                        <View
                          style={[
                            styles.gradeRule,
                            active && { backgroundColor: colors.accent },
                          ]}
                        />
                        <View style={styles.gradeMain}>
                          <Text
                            style={[
                              styles.gradeCode,
                              active && styles.gradeCodeOn,
                            ]}
                          >
                            {level.label}
                          </Text>
                          <Text
                            style={[
                              styles.gradeNote,
                              active && styles.gradeNoteOn,
                            ]}
                          >
                            {level.note}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.gradeRange,
                            active && styles.gradeRangeOn,
                          ]}
                        >
                          {level.range}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Divider style={styles.rule} />
                <DataRow
                  label="Views with damage"
                  value={`${extent.infestedViews} of ${extent.views}`}
                />
                <DataRow
                  label="Extent"
                  value={percent(extent.percent, 0)}
                  valueColor={
                    extent.percent > 0 ? bandColor(band).line : undefined
                  }
                />
              </>
            ) : null}

            {perKernel ? (
              <>
                <Divider style={styles.rule} />
                <Text style={styles.scaleLabel}>Class distribution</Text>
                {Object.entries(visualResult.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, n]) => (
                    <DataRow
                      key={code}
                      label={labelFor(code)}
                      hint={code}
                      value={`${n} · ${percent(
                        (n / visualResult.sampleSize) * 100,
                        0,
                      )}`}
                    />
                  ))}
              </>
            ) : null}
          </Panel>
        ) : null}

        {mode === 'vision' && perKernel ? (
          <>
            {/* ── Grade assignment ─────────────────────────────────── */}
            <Panel style={styles.block}>
              <PanelHeader label="Grade assignment" icon="award" />
              <Text style={styles.intro}>
                Assigned on total defect share. The matched band is marked.
              </Text>

              <View style={styles.gradeTable}>
                {GRADES.map((grade, i) => {
                  const active = i === gradeIndex;
                  const prev = i === 0 ? 0 : GRADES[i - 1].max;
                  const range =
                    grade.max === Infinity
                      ? `above ${prev}%`
                      : `${prev === 0 ? '0' : `${prev}`}–${grade.max}%`;
                  return (
                    <View key={grade.code} style={styles.gradeRow}>
                      <View
                        style={[
                          styles.gradeRule,
                          active && { backgroundColor: colors.accent },
                        ]}
                      />
                      <View style={styles.gradeMain}>
                        <Text
                          style={[
                            styles.gradeCode,
                            active && styles.gradeCodeOn,
                          ]}
                        >
                          {grade.code}
                        </Text>
                        <Text
                          style={[
                            styles.gradeNote,
                            active && styles.gradeNoteOn,
                          ]}
                        >
                          {grade.note}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.gradeRange,
                          active && styles.gradeRangeOn,
                        ]}
                      >
                        {range}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <Divider style={styles.rule} />

              <Text style={styles.scaleLabel}>Total defect share</Text>
              <ThresholdBar
                metric="damagePercent"
                value={damage}
                showScale
                unit="%"
              />
            </Panel>

            {/* ── Defect breakdown ─────────────────────────────────── */}
            <Panel style={styles.block}>
              <PanelHeader
                label="Defect breakdown"
                icon="grid"
                right={<Text style={styles.meta}>count · share</Text>}
              />

              <View style={styles.chart}>
                <ProportionBar
                  total={vision.sampleSize}
                  remainderLabel="Sound"
                  segments={[
                    {
                      key: 'bore',
                      label: 'Bore holes',
                      value: vision.boreHoles,
                      color: colors.critical,
                    },
                    {
                      key: 'disc',
                      label: 'Discoloration',
                      value: vision.discoloration,
                      color: colors.caution,
                    },
                    {
                      key: 'mould',
                      label: 'Mould',
                      value: vision.mould,
                      color: colors.plot,
                    },
                    {
                      key: 'frag',
                      label: 'Fragments',
                      value: vision.fragmentation,
                      color: colors.idle,
                    },
                  ]}
                />
              </View>

              <Divider style={styles.rule} />

              {defects.map(defect => (
                <DataRow
                  key={defect.key}
                  label={defect.label}
                  value={`${defect.count}  ${percent(defect.percent)}`}
                  valueColor={
                    defect.band === 'ok'
                      ? undefined
                      : bandColor(defect.band).line
                  }
                />
              ))}
            </Panel>
          </>
        ) : mode === 'acoustic' ? (
          <Panel style={styles.block}>
            <PanelHeader
              label="Probe classification"
              icon="activity"
              right={
                <Text style={styles.meta}>
                  {acoustic.windowCount
                    ? `${acoustic.windowCount} windows`
                    : 'No result'}
                </Text>
              }
            />

            {acoustic.windowProbabilities.length ? (
              <View style={styles.chart}>
                <Waveform
                  envelope={acoustic.windowProbabilities}
                  band={acousticBand(acoustic)}
                  threshold={acoustic.threshold}
                  caption="one-second window probabilities · event mean above"
                />
              </View>
            ) : (
              <Text style={styles.emptyResult}>
                No probe-backed acoustic result is available.
              </Text>
            )}

            <Divider style={styles.rule} />

            <DataRow
              label="Infestation probability"
              value={
                acoustic.probabilityInfested == null
                  ? '—'
                  : percent(acoustic.probabilityInfested * 100, 0)
              }
              valueColor={bandColor(acousticBand(acoustic)).line}
            />
            <DataRow
              label="Classification"
              value={
                acoustic.classification
                  ? ACOUSTIC_CLASS_LABEL[acoustic.classification]
                  : 'No classified event'
              }
              mono={false}
            />
            <DataRow
              label="Probe"
              value={acoustic.probeId ?? '—'}
              hint={
                acoustic.sampleRateHz
                  ? `${acoustic.sampleRateHz} Hz · ${acoustic.featureSpace}`
                  : 'No acoustic event metadata'
              }
            />
          </Panel>
        ) : null}

        {/* ── Next step ────────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader label="Next step" icon="corner-down-right" />
          <View style={styles.advice}>
            <View
              style={[
                styles.adviceRule,
                { backgroundColor: bandColor(band).line },
              ]}
            />
            <Text style={styles.adviceText}>{nextStep}</Text>
          </View>
        </Panel>

        {/* ── Provenance ───────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader label="How this was measured" icon="cpu" />
          <DataRow
            label="Model"
            value={mode === 'vision' ? vision.model : acoustic.modelName}
          />
          <DataRow
            label={mode === 'vision' ? 'Sample' : 'Window'}
            value={
              mode === 'vision'
                ? perKernel
                  ? `${vision.sampleSize} kernels`
                  : `${vision.sampleSize} heap views`
                : `${acoustic.windowCount} × 1 s windows`
            }
          />
          {mode === 'vision' ? (
            <DataRow
              label="Confidence"
              value={percent(vision.confidence * 100, 0)}
            />
          ) : (
            <DataRow label="Model version" value={acoustic.modelVersion} />
          )}
          <DataRow
            label="Node"
            value={silo.nodeId}
            hint={silo.nodeOnline ? 'online' : 'offline'}
          />

          <Divider style={styles.rule} />
          <View style={styles.caveat}>
            <Icon name="info" size={13} color={colors.textTertiary} />
            <Text style={styles.caveatText}>
              A single draw point is not the lot. Confirm anything above{' '}
              {LIMITS.damagePercent.ok}% with a second sample before you act on
              price.
            </Text>
          </View>
        </Panel>
      </View>
    </Screen>
  );
}

/** "beans" → "Beans", for showing the model's lowercase crop key. */
function cap(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function advice(mode: string, band: string, crop: string) {
  if (mode === 'acoustic') {
    if (band === 'critical')
      return 'The model classified this event as infested. Isolate the lot and confirm with physical inspection before choosing a treatment.';
    if (band === 'caution')
      return 'This event falls inside the model review band. Repeat the probe measurement under controlled conditions and inspect the grain manually.';
    return 'The model classified this event as clean. Keep the normal monitoring interval and review any later change in probability.';
  }
  if (band === 'critical')
    return `Defect share puts this ${crop.toLowerCase()} outside storage tolerance. Divert the lot to immediate sale or processing instead of sealing it.`;
  if (band === 'caution')
    return `Defect share is climbing. Re-sample from a second draw point, and move this ${crop.toLowerCase()} ahead of sounder lots in the sale order.`;
  return 'Sample is within premium tolerance. Safe to seal for long-term storage at the current moisture content.';
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter },
  first: { marginTop: space.md },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.lg },
  chart: { marginTop: space.lg },
  emptyResult: { ...type.bodySm, color: colors.textTertiary, marginTop: space.lg },
  grow: { flex: 1 },
  notice: { marginTop: space.md },
  meta: { ...type.monoSm, ...tabular, color: colors.textTertiary },

  gaugeWrap: { alignItems: 'center', marginTop: space.lg },
  subject: {
    ...type.monoSm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: space.md,
  },

  verdict: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  verdictRule: { width: 3, alignSelf: 'stretch', borderRadius: 1.5 },
  verdictMain: { flex: 1, minWidth: 0 },
  verdictHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flexWrap: 'wrap',
  },
  verdictLabel: { ...type.reading },
  verdictDetail: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  verdictWarn: { ...type.bodySm, color: colors.caution, marginTop: space.sm },
  lowTrust: {
    ...type.label,
    color: colors.caution,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.caution,
    borderRadius: 3,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },

  levelTable: { marginTop: space.lg },

  intro: { ...type.bodySm, color: colors.textTertiary, marginTop: space.md },

  gradeTable: { marginTop: space.lg },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  gradeRule: { width: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  gradeMain: { flex: 1, minWidth: 0 },
  gradeCode: { ...type.label, color: colors.textTertiary },
  gradeCodeOn: { color: colors.text },
  gradeNote: {
    ...type.bodySm,
    color: colors.textTertiary,
    marginTop: space.xxs,
  },
  gradeNoteOn: { color: colors.textSecondary },
  gradeRange: { ...type.mono, ...tabular, color: colors.textTertiary },
  gradeRangeOn: { color: colors.text, fontWeight: '700' },

  scaleLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.md,
  },

  advice: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  adviceRule: { width: 2, alignSelf: 'stretch', borderRadius: 1 },
  adviceText: { ...type.body, color: colors.text, flex: 1 },

  caveat: { flexDirection: 'row', gap: space.sm },
  caveatText: { ...type.bodySm, color: colors.textTertiary, flex: 1 },

  footer: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});

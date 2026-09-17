import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { ProportionBar } from '../components/ProportionBar';
import { Screen } from '../components/Screen';
import { Sparkline } from '../components/Sparkline';
import { StatusMark } from '../components/StatusMark';
import { ThresholdBar } from '../components/ThresholdBar';

import { ago, bandColor, percent } from '../core/format';
import { bandOf, LIMITS, totalDamagePercent, visionDefects } from '../core/monitoring';
import { colors, gutter, space, tabular, type } from '../core/theme';
import { useSilo, useVisionScans } from '../state/facilityStore';

export default function VisionHistoryScreen({ navigation, route }: any) {
  const siloId = route?.params?.siloId;
  const scanId = route?.params?.scanId;
  const silo = useSilo(siloId);
  const allScans = useVisionScans();

  // Newest first for the log, oldest first for the trend.
  const scans = useMemo(
    () => allScans.filter(s => s.siloId === silo.id),
    [allScans, silo.id],
  );
  const series = useMemo(
    () => [...scans].reverse().map(s => totalDamagePercent(s)),
    [scans],
  );

  const latest = scans[0];
  const latestDamage = latest ? totalDamagePercent(latest) : 0;
  const previousDamage = scans.length > 1 ? totalDamagePercent(scans[1]) : null;
  const delta = previousDamage === null ? null : latestDamage - previousDamage;
  const band = bandOf(latestDamage, 'damagePercent');

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label="New scan"
            icon="camera"
            variant="secondary"
            onPress={() => navigation.navigate('MainApp', { screen: 'Scanner' })}
            style={styles.grow}
          />
        </View>
      }
    >
      <AppBar
        eyebrow={`${silo.code} · ${silo.crop}`}
        title="Vision history"
        onBack={() => navigation.goBack()}
        right={latest ? <StatusMark band={band} label={percent(latestDamage)} /> : undefined}
      />

      {!latest ? (
        <View style={styles.body}>
          <Panel style={styles.first}>
            <EmptyState
              icon="camera-off"
              title="No scans for this probe"
              body={`Run a vision scan for ${silo.name} to start a damage history. Two scans are enough to show a trend.`}
            />
          </Panel>
        </View>
      ) : (
        <View style={styles.body}>
          {/* ── Trend ────────────────────────────────────────────────── */}
          <Panel style={styles.first}>
            <PanelHeader
              label="Defect share over time"
              icon="trending-up"
              right={<Text style={styles.meta}>{scans.length} scans</Text>}
            />

            <View style={styles.headline}>
              <Text style={[styles.headlineValue, { color: bandColor(band).line }]} allowFontScaling={false}>
                {latestDamage.toFixed(1)}
              </Text>
              <Text style={styles.headlineUnit}>% of sample</Text>
            </View>

            {delta === null ? (
              <Text style={styles.explain}>
                First recorded scan for this probe. A second scan will establish the direction.
              </Text>
            ) : (
              <View style={styles.deltaRow}>
                <Icon
                  name={Math.abs(delta) < 0.1 ? 'minus' : delta > 0 ? 'arrow-up-right' : 'arrow-down-right'}
                  size={13}
                  color={delta > 0 ? colors.caution : colors.ok}
                />
                <Text style={styles.deltaText}>
                  {Math.abs(delta) < 0.1
                    ? `Unchanged since ${scans[1].day}.`
                    : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} points since ${scans[1].day}.`}
                  {delta > 0 && latestDamage > LIMITS.damagePercent.ok
                    ? ' Damage is accumulating faster than the sale schedule allows.'
                    : ''}
                </Text>
              </View>
            )}

            <View style={styles.chart}>
              <Sparkline
                series={series}
                metric="damagePercent"
                unit="%"
                height={84}
                caption={`${series.length} scans · oldest left`}
              />
            </View>

            <Divider style={styles.rule} />

            <Text style={styles.fieldLabel}>Latest against tolerance</Text>
            <ThresholdBar metric="damagePercent" value={latestDamage} showScale unit="%" height={10} />
          </Panel>

          {/* ── Per-scan log ─────────────────────────────────────────── */}
          {scans.map(scan => {
            const damage = totalDamagePercent(scan);
            const scanBand = bandOf(damage, 'damagePercent');
            const defects = visionDefects(scan);
            const selected = scan.id === scanId;

            return (
              <Panel key={scan.id} style={styles.block}>
                <PanelHeader
                  label={scan.day}
                  icon="camera"
                  right={
                    <View style={styles.headRight}>
                      {selected ? <Text style={styles.selected}>opened</Text> : null}
                      <StatusMark band={scanBand} label={percent(damage)} />
                    </View>
                  }
                />

                <Text style={styles.scanLabel}>{scan.label}</Text>

                <View style={styles.chart}>
                  <ProportionBar
                    total={scan.sampleSize}
                    remainderLabel="Sound"
                    segments={[
                      { key: 'bore', label: 'Bore holes', value: scan.boreHoles, color: colors.critical },
                      { key: 'disc', label: 'Discoloration', value: scan.discoloration, color: colors.caution },
                      { key: 'mould', label: 'Mould', value: scan.mould, color: colors.plot },
                      { key: 'frag', label: 'Fragments', value: scan.fragmentation, color: colors.idle },
                    ]}
                  />
                </View>

                <Divider style={styles.rule} />

                {defects.map(defect => (
                  <DataRow
                    key={defect.key}
                    label={defect.label}
                    value={`${defect.count}  ${percent(defect.percent)}`}
                    valueColor={defect.band === 'ok' ? undefined : bandColor(defect.band).line}
                  />
                ))}

                <Divider style={styles.rule} />
                <DataRow
                  label="Sample"
                  value={`${scan.sampleSize} kernels`}
                  hint={`${percent(scan.confidence * 100, 0)} confidence · ${ago(scan.minutesAgo)}`}
                />
              </Panel>
            );
          })}

          {/* ── Method ───────────────────────────────────────────────── */}
          <Panel style={styles.block}>
            <PanelHeader label="How sampling works" icon="info" />
            <Text style={styles.explain}>
              Each scan grades one spread layer associated with this probe. Defect counts
              are per kernel; the share is the count over the sample size, so a small sample carries
              a wide margin. Two draw points that disagree by more than{' '}
              {LIMITS.damagePercent.ok} points usually mean the damage is localised — worth probing
              at depth before grading the whole lot.
            </Text>
            <Divider style={styles.rule} />
            <DataRow label="Model" value={silo.vision.model} />
            <DataRow label="Probe" value={silo.nodeId} hint={silo.nodeOnline ? 'online' : 'offline'} />
          </Panel>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter },
  first: { marginTop: space.md },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.md },
  chart: { marginTop: space.lg },
  grow: { flex: 1 },
  meta: { ...type.monoSm, ...tabular, color: colors.textTertiary },

  headline: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.lg },
  headlineValue: { ...type.display, ...tabular },
  headlineUnit: { ...type.unit, color: colors.textSecondary },

  deltaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.md },
  deltaText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  explain: { ...type.bodySm, color: colors.textTertiary, marginTop: space.md },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.md },

  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  selected: { ...type.monoSm, color: colors.accent },
  scanLabel: { ...type.body, color: colors.text, marginTop: space.md },

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

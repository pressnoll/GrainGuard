import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AppBar } from '../components/AppBar';
import { EmptyState } from '../components/EmptyState';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { ProportionBar } from '../components/ProportionBar';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { Sparkline } from '../components/Sparkline';
import { StatusMark } from '../components/StatusMark';

import { ago, bandColor, percent } from '../core/format';
import { ACOUSTIC_CLASS_LABEL } from '../core/acoustic';
import {
  bandOf,
  LIMITS,
  totalDamagePercent,
  visionDefects,
  type Band,
} from '../core/monitoring';
import { colors, gutter, space, tabular, type } from '../core/theme';
import {
  useAcousticEvents,
  useSilo,
  useVisionScans,
} from '../state/facilityStore';

const VIEWS = [
  { key: 'acoustic', label: 'Acoustic' },
  { key: 'environment', label: 'Environment' },
  { key: 'vision', label: 'Vision' },
];

export default function InsightsScreen({ navigation }: any) {
  const [view, setView] = useState('acoustic');
  const silo = useSilo(undefined);
  const live = silo.nodeOnline;
  const waiting = silo.hasReported === false;

  return (
    <Screen bottomInset={false}>
      <AppBar
        eyebrow="Telemetry stream"
        title="Analysis"
        divider={false}
        right={
          <StatusMark
            band={live ? 'ok' : waiting ? 'idle' : 'critical'}
            label={live ? 'Live' : waiting ? 'Waiting' : 'Stale'}
            muted={!live}
            pulse={live}
          />
        }
      />

      <View style={styles.strip}>
        <SegmentedControl
          items={VIEWS}
          value={view}
          onChange={setView}
          align="fill"
        />
      </View>

      <View style={styles.body}>
        {view === 'acoustic' ? (
          <AcousticView navigation={navigation} silo={silo} />
        ) : null}
        {view === 'environment' ? (
          <EnvironmentView silo={silo} />
        ) : null}
        {view === 'vision' ? (
          <VisionView navigation={navigation} silo={silo} />
        ) : null}
      </View>
    </Screen>
  );
}

// ─── Acoustic ────────────────────────────────────────────────────────

function AcousticView({ navigation, silo }: any) {
  const events = useAcousticEvents().filter(event => event.siloId === silo.id);

  if (events.length === 0) {
    return (
      <Panel style={styles.first}>
        <EmptyState
          icon="activity"
          title="No detections logged"
          body="No classified piezo event has been written yet. Wake the probe; valid Firestore inbox events are classified automatically on this phone."
        />
      </Panel>
    );
  }

  return (
    <Panel style={styles.first} inset={false}>
      <View style={styles.panelPad}>
        <PanelHeader
          label={`Detection log · ${events.length}`}
          icon="activity"
          right={<Text style={styles.meta}>newest first</Text>}
        />
      </View>

      {events.map((event, i) => {
        const band: Band =
          event.classification === 'infested'
            ? 'critical'
            : event.classification === 'needs_review'
            ? 'caution'
            : event.classification === 'clean'
            ? 'ok'
            : 'idle';
        const code = silo.code;
        return (
          <View key={event.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() =>
                navigation.navigate('AcousticDetail', {
                  siloId: event.siloId,
                  eventId: event.id,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`${event.clock}, ${code}, ${
                event.classification ?? 'legacy acoustic event'
              }`}
              style={({ pressed }) => [styles.event, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.eventRule,
                  { backgroundColor: bandColor(band).line },
                ]}
              />
              <View style={styles.eventBody}>
                <View style={styles.eventHead}>
                  <Text style={styles.clock}>{event.clock}</Text>
                  <Text style={styles.code}>{code}</Text>
                  <Text style={styles.metaFill}>{ago(event.minutesAgo)}</Text>
                  <Icon
                    name="chevron-right"
                    size={15}
                    color={colors.textTertiary}
                  />
                </View>

                <Text style={styles.eventTitle}>
                  {event.classification
                    ? ACOUSTIC_CLASS_LABEL[event.classification]
                    : 'Legacy acoustic event'}
                </Text>
                <Text style={styles.eventDetail}>
                  {event.probeId} · {event.windowCount} one-second windows
                </Text>

                <View style={styles.chips}>
                  <Metric
                    label="Infestation"
                    value={
                      event.probabilityInfested == null
                        ? '—'
                        : percent(event.probabilityInfested * 100, 0)
                    }
                    tint={bandColor(band).line}
                  />
                  <Metric
                    label="Temperature"
                    value={
                      event.temperatureC == null
                        ? '—'
                        : `${event.temperatureC.toFixed(1)}°C`
                    }
                  />
                  <Metric
                    label="Humidity"
                    value={
                      event.humidityPct == null ? '—' : `${event.humidityPct}%`
                    }
                  />
                </View>
              </View>
            </Pressable>
          </View>
        );
      })}
    </Panel>
  );
}

// ─── Environment ─────────────────────────────────────────────────────

function EnvironmentView({ silo }: { silo: ReturnType<typeof useSilo> }) {
  const env = silo.environment;
  const valueColor = (
    available: boolean,
    value: number,
    metric: Parameters<typeof bandOf>[1],
  ) => {
    if (!available) return undefined;
    const band = bandOf(value, metric);
    return band === 'ok' ? undefined : bandColor(band).line;
  };

  return (
    <>
      <Panel style={styles.first}>
        <PanelHeader label={`Current readings · ${silo.code}`} icon="thermometer" />
        <DataRow
          label="Temperature"
          value={
            env.temperatureAvailable
              ? `${env.temperatureC.toFixed(1)}°C`
              : 'Unavailable'
          }
          valueColor={valueColor(
            env.temperatureAvailable,
            env.temperatureC,
            'temperatureC',
          )}
        />
        <DataRow
          label="Relative humidity"
          value={
            env.humidityAvailable
              ? `${env.relativeHumidity.toFixed(1)}% RH`
              : 'Unavailable'
          }
          valueColor={valueColor(
            env.humidityAvailable,
            env.relativeHumidity,
            'relativeHumidity',
          )}
        />
        <DataRow
          label="Grain moisture"
          value={
            env.moistureAvailable
              ? `${env.moistureContent.toFixed(1)}%`
              : 'Unavailable'
          }
          valueColor={valueColor(
            env.moistureAvailable,
            env.moistureContent,
            'moistureContent',
          )}
        />

        <Divider style={styles.rule} />
        <Text style={styles.note}>
          Safe ceilings: {LIMITS.temperatureC.ok}°C,{' '}
          {LIMITS.relativeHumidity.ok}% RH, {LIMITS.moistureContent.ok}%
          moisture content. Moisture content is measured on the grain, not in
          the air.
        </Text>
      </Panel>

      <Panel style={styles.block}>
        <PanelHeader
          label="Trend"
          icon="trending-up"
          right={
            <Text style={styles.meta}>
              {silo.hasReported === false ? 'Waiting' : ago(silo.minutesAgo)}
            </Text>
          }
        />

        <Text style={styles.chartLabel}>Relative humidity</Text>
        {env.humiditySeries.length ? (
          <Sparkline
            series={env.humiditySeries}
            metric="relativeHumidity"
            unit="%"
          />
        ) : (
          <Text style={styles.note}>Waiting for humidity readings.</Text>
        )}

        <Text style={[styles.chartLabel, styles.chartLabelSpaced]}>
          Temperature
        </Text>
        {env.temperatureSeries.length ? (
          <Sparkline
            series={env.temperatureSeries}
            metric="temperatureC"
            unit="°C"
          />
        ) : (
          <Text style={styles.note}>Waiting for temperature readings.</Text>
        )}
      </Panel>
    </>
  );
}

// ─── Vision ──────────────────────────────────────────────────────────

function VisionView({ navigation, silo }: any) {
  const scans = useVisionScans().filter(scan => scan.siloId === silo.id);

  if (scans.length === 0) {
    return (
      <Panel style={styles.first}>
        <EmptyState
          icon="camera-off"
          title="No scans recorded"
          body="Run a vision scan from the Scan tab to start a history."
        />
      </Panel>
    );
  }

  return (
    <>
      {scans.map((scan, i) => {
        const damage = totalDamagePercent(scan);
        const band = bandOf(damage, 'damagePercent');
        const defects = visionDefects(scan);

        return (
          <Panel key={scan.id} style={i === 0 ? styles.first : styles.block}>
            <PanelHeader
              label={`${scan.day} · ${silo.code}`}
              icon="camera"
              onPress={() =>
                navigation.navigate('VisionHistory', {
                  scanId: scan.id,
                  siloId: scan.siloId,
                })
              }
              actionLabel={`Open scan from ${scan.day}`}
              right={<StatusMark band={band} label={percent(damage)} />}
            />

            <Text style={styles.scanLabel}>{scan.label}</Text>

            <View style={styles.chart}>
              <ProportionBar
                total={scan.sampleSize}
                remainderLabel="Sound"
                legend={false}
                segments={[
                  {
                    key: 'bore',
                    label: 'Bore holes',
                    value: scan.boreHoles,
                    color: colors.critical,
                  },
                  {
                    key: 'disc',
                    label: 'Discoloration',
                    value: scan.discoloration,
                    color: colors.caution,
                  },
                  {
                    key: 'mould',
                    label: 'Mould',
                    value: scan.mould,
                    color: colors.plot,
                  },
                  {
                    key: 'frag',
                    label: 'Fragments',
                    value: scan.fragmentation,
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
                  defect.band === 'ok' ? undefined : bandColor(defect.band).line
                }
              />
            ))}

            <Divider style={styles.rule} />
            <DataRow
              label="Sample"
              value={`${scan.sampleSize} kernels`}
              hint={`${percent(scan.confidence * 100, 0)} confidence · ${ago(
                scan.minutesAgo,
              )}`}
            />
          </Panel>
        );
      })}
    </>
  );
}

function Metric({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, !!tint && { color: tint }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: gutter },
  body: { paddingHorizontal: gutter },
  first: { marginTop: space.xl },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.md },
  chart: { marginTop: space.lg },
  panelPad: { padding: space.lg, paddingBottom: 0 },
  meta: { ...type.monoSm, ...tabular, color: colors.textTertiary },
  metaFill: {
    ...type.monoSm,
    ...tabular,
    color: colors.textTertiary,
    flex: 1,
    textAlign: 'right',
  },

  // Event log
  event: { flexDirection: 'row', gap: space.md, padding: space.lg },
  pressed: { opacity: 0.65 },
  eventRule: { width: 2, borderRadius: 1 },
  eventBody: { flex: 1, minWidth: 0 },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  clock: { ...type.mono, ...tabular, color: colors.text, fontWeight: '700' },
  code: { ...type.label, color: colors.textSecondary },
  eventTitle: {
    ...type.title,
    color: colors.text,
    marginTop: space.sm,
    fontStyle: 'italic',
  },
  eventDetail: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginTop: space.xs,
  },

  chips: { flexDirection: 'row', gap: space.xl, marginTop: space.md },
  metric: {},
  metricLabel: { ...type.label, color: colors.textTertiary },
  metricValue: {
    ...type.mono,
    ...tabular,
    color: colors.text,
    marginTop: space.xxs,
    fontWeight: '700',
  },

  note: { ...type.bodySm, color: colors.textTertiary },
  chartLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.sm,
  },
  chartLabelSpaced: { marginTop: space.xl },
  scanLabel: { ...type.body, color: colors.text, marginTop: space.md },
});

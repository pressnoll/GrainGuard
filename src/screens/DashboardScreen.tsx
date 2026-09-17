import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AlertRow } from '../components/AlertRow';
import { AppBar, IconButton } from '../components/AppBar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Notice } from '../components/Notice';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { ProportionBar } from '../components/ProportionBar';
import { Reading } from '../components/Reading';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { Sparkline } from '../components/Sparkline';
import { StatusMark } from '../components/StatusMark';
import { TickGauge } from '../components/TickGauge';

import { ago, bandColor, percent } from '../core/format';
import { ACOUSTIC_CLASS_LABEL } from '../core/acoustic';
import {
  BAND_LABEL,
  acousticBand,
  bandOf,
  deriveAlerts,
  equilibriumMoisture,
  fleetSummary,
  healthIndex,
  LIMITS,
  totalDamagePercent,
  visionDefects,
} from '../core/monitoring';
import { colors, gutter, space, tabular, type } from '../core/theme';
import {
  useFacility,
  useFacilityError,
  useFacilityStore,
  useSilo,
  useSilos,
} from '../state/facilityStore';

const SERIES = [
  { key: 'humidity', label: 'Humidity' },
  { key: 'temperature', label: 'Temperature' },
];

export default function DashboardScreen({ navigation }: any) {
  const facility = useFacility();
  const silos = useSilos();
  const facilityError = useFacilityError();
  const reage = useFacilityStore(s => s.reage);

  const [seriesKey, setSeriesKey] = useState('humidity');
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Readings arrive by listener, so there is nothing to fetch. What the pull
    // does do is re-age the timestamps and give the gesture an acknowledgement
    // long enough to read as one.
    reage();
    timer.current = setTimeout(() => setRefreshing(false), 600);
  }, [reage]);

  const silo = useSilo(undefined);
  const env = silo.environment;
  const health = useMemo(() => healthIndex(silo), [silo]);
  const alerts = useMemo(() => deriveAlerts(silo), [silo]);
  const fleet = useMemo(() => fleetSummary(silos), [silos]);
  const defects = useMemo(() => visionDefects(silo.vision), [silo]);

  const emc =
    env.temperatureAvailable &&
    env.humidityAvailable &&
    silo.crop !== 'Not set'
      ? equilibriumMoisture(env.temperatureC, env.relativeHumidity, silo.crop)
      : null;
  const drift =
    emc != null && env.moistureAvailable ? emc - env.moistureContent : null;
  const damage = totalDamagePercent(silo.vision);
  const visionAvailable = silo.vision.sampleSize > 0;
  const activityBand = acousticBand(silo.acoustic);

  const routeForAlert = (modality: string) => {
    switch (modality) {
      case 'acoustic':
        return 'AcousticDetail';
      case 'vision':
        return 'VisionHistory';
      case 'node':
        return 'SiloManagement';
      default:
        return 'ThresholdConfig';
    }
  };

  return (
    <Screen bottomInset={false} onRefresh={onRefresh} refreshing={refreshing}>
      <AppBar
        eyebrow={`${facility.name} · ${facility.region}`}
        title="Overview"
        divider={false}
        right={
          <IconButton
            name="bell"
            label={`Live alerts, ${fleet.alertCount} active`}
            badge={fleet.alertCount}
            onPress={() => navigation.navigate('Notifications')}
          />
        }
      />

      {facilityError ? (
        <View style={styles.notice}>
          <Notice
            tone="caution"
            title="Store not syncing"
            detail={facilityError}
          />
        </View>
      ) : null}

      {/* One-probe defence summary. */}
      <View style={styles.fleet}>
        <Stat label="Probe" value={silo.code} />
        <Stat
          label="Status"
          value={
            silo.nodeOnline
              ? 'Online'
              : silo.hasReported === false
                ? 'Waiting'
                : 'Offline'
          }
          tint={
            silo.nodeOnline
              ? colors.ok
              : silo.hasReported === false
                ? colors.textSecondary
                : colors.critical
          }
        />
        <Stat
          label="Attention"
          value={String(fleet.needAttention)}
          tint={fleet.needAttention > 0 ? colors.caution : colors.ok}
        />
        <Stat
          label="Synced"
          value={
            silo.hasReported === false ? 'Waiting' : ago(fleet.freshestMinutes)
          }
          mono
        />
      </View>

      <View style={styles.body}>
        {/* ── Health index ─────────────────────────────────────────── */}
        <Panel style={styles.first}>
          <PanelHeader
            label="Grain health index"
            icon="shield"
            right={
              <StatusMark
                band={silo.nodeOnline ? health.band : 'idle'}
                label={silo.nodeOnline ? BAND_LABEL[health.band] : silo.hasReported === false ? 'Waiting' : 'Stale'}
              />
            }
          />

          <View style={styles.gaugeWrap}>
            <TickGauge
              value={health.index}
              band={health.band}
              caption={health.label}
              size={190}
            />
          </View>

          <Text style={styles.gaugeCaption}>
            {silo.name} · {silo.crop} · probe {silo.nodeId}
          </Text>

          <Divider style={styles.rule} />

          <View style={styles.subscores}>
            {health.subscores.map(sub => {
              const tint = bandColor(sub.band).line;
              return (
                <View key={sub.key} style={styles.subscore}>
                  <Text style={styles.subLabel} numberOfLines={1}>
                    {sub.label}
                  </Text>
                  <View style={styles.subValueRow}>
                    <Text style={[styles.subValue, { color: tint }]}>
                      {sub.score}
                    </Text>
                    <Text style={styles.subWeight}>
                      ×{sub.weight.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.subTrack}>
                    <View
                      style={[
                        styles.subFill,
                        { width: `${sub.score}%`, backgroundColor: tint },
                      ]}
                    />
                  </View>
                  <Text style={styles.subLimit} numberOfLines={1}>
                    {sub.limitedBy}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.method}>
            Weighted fusion of the available modalities. Each scores as its own
            worst reading, named above; missing channels are excluded rather
            than treated as zero.
          </Text>
        </Panel>

        <View style={styles.actions}>
          <Button
            label="Run scan"
            icon="mic"
            onPress={() => navigation.navigate('Scanner')}
            style={styles.action}
          />
          <Button
            label="Thresholds"
            icon="sliders"
            variant="secondary"
            onPress={() => navigation.navigate('ThresholdConfig')}
            style={styles.action}
          />
        </View>

        {/* ── Derived alerts ───────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader
            label={
              alerts.length
                ? `Action required · ${alerts.length}`
                : 'Threshold check'
            }
            icon={alerts.length ? 'alert-triangle' : 'check-circle'}
            right={
              alerts.length ? undefined : (
                <Text style={styles.headerMeta}>No active alerts</Text>
              )
            }
          />

          {alerts.length === 0 ? (
            <EmptyState
              icon="check-circle"
              tint={colors.ok}
              title="Every parameter inside its band"
              body={`No available measurement is outside its configured band for ${silo.name}. Missing channels are excluded rather than treated as zero.`}
            />
          ) : (
            alerts.map((alert, i) => (
              <View key={alert.id}>
                {i > 0 ? <Divider /> : null}
                <AlertRow
                  alert={alert}
                  onPress={() =>
                    navigation.navigate(routeForAlert(alert.modality), {
                      siloId: silo.id,
                    })
                  }
                />
              </View>
            ))
          )}
        </Panel>

        {/* ── Environment ──────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader
            label="Environment"
            icon="thermometer"
            right={
              <Text style={styles.headerMeta}>{silo.hasReported === false ? 'waiting for first reading' : ago(silo.minutesAgo)}</Text>
            }
          />

          <View style={styles.grid}>
            <Reading
              label="Temperature"
              metric="temperatureC"
              numeric={env.temperatureC}
              unit="°C"
              trend={env.temperatureTrend}
              available={env.temperatureAvailable}
            />
            <Reading
              label="Rel. humidity"
              metric="relativeHumidity"
              numeric={env.relativeHumidity}
              unit="%"
              precision={0}
              trend={env.humidityTrend}
              available={env.humidityAvailable}
            />
          </View>

          <View style={styles.grid}>
            <Reading
              label="Moisture content"
              metric="moistureContent"
              numeric={env.moistureContent}
              unit="% wb"
              available={env.moistureAvailable}
            />
            <Reading
              label="Equilibrium target"
              metric="moistureContent"
              numeric={emc ?? 0}
              unit="% wb"
              available={emc != null}
            />
          </View>

          {/* The predictive line: where the grain is heading, not just where
              it is. This is the difference between a readout and a warning. */}
          {emc != null && drift != null ? (
            <View style={styles.forecast}>
              <Icon
                name={
                  Math.abs(drift) < 0.2
                    ? 'minus'
                    : drift > 0
                    ? 'arrow-up-right'
                    : 'arrow-down-right'
                }
                size={13}
                color={
                  drift > 0 && emc > LIMITS.moistureContent.ok
                    ? colors.caution
                    : colors.textTertiary
                }
              />
              <Text style={styles.forecastText}>
                {Math.abs(drift) < 0.2
                  ? `Grain is at equilibrium with the headspace air at ${env.temperatureC}°C / ${env.relativeHumidity}% RH.`
                  : `At ${env.temperatureC}°C and ${
                      env.relativeHumidity
                    }% RH the grain will ${
                      drift > 0 ? 'take up' : 'give off'
                    } moisture toward ${emc.toFixed(1)}% wb.`}
                {drift > 0 && emc > LIMITS.moistureContent.ok
                  ? ` That crosses the ${LIMITS.moistureContent.ok}% storage ceiling, so the store needs drier air rather than only cooler air.`
                  : ''}
              </Text>
            </View>
          ) : (
            <View style={styles.forecast}>
              <Icon name="info" size={13} color={colors.textTertiary} />
              <Text style={styles.forecastText}>
                Equilibrium moisture needs valid temperature, humidity and
                grain-moisture readings.
              </Text>
            </View>
          )}

          <Divider style={styles.rule} />

          <SegmentedControl
            items={SERIES}
            value={seriesKey}
            onChange={setSeriesKey}
          />
          <View style={styles.chart}>
            {seriesKey === 'humidity' ? (
              <Sparkline
                series={env.humiditySeries}
                metric="relativeHumidity"
                unit="%"
              />
            ) : (
              <Sparkline
                series={env.temperatureSeries}
                metric="temperatureC"
                unit="°C"
              />
            )}
          </View>
        </Panel>

        {/* ── Acoustic ─────────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader
            label="Acoustic detection"
            icon="activity"
            onPress={() =>
              navigation.navigate('AcousticDetail', { siloId: silo.id })
            }
            actionLabel="Open acoustic detail"
            right={
              <StatusMark
                band={activityBand}
                label={
                  activityBand === 'ok' ? 'Clear' : BAND_LABEL[activityBand]
                }
              />
            }
          />

          <DataRow
            label="Infestation probability"
            value={
              silo.acoustic.probabilityInfested == null
                ? '—'
                : percent(silo.acoustic.probabilityInfested * 100, 0)
            }
            valueColor={bandColor(activityBand).line}
            hint={
              silo.acoustic.scanId ? ago(silo.acoustic.minutesAgo) : undefined
            }
          />
          <DataRow
            label="Classification"
            value={
              silo.acoustic.classification
                ? ACOUSTIC_CLASS_LABEL[silo.acoustic.classification]
                : 'No classified event'
            }
            mono={false}
          />
          <DataRow
            label="Probe"
            value={silo.acoustic.probeId ?? '—'}
            hint={
              silo.acoustic.windowCount
                ? `${silo.acoustic.windowCount} one-second windows`
                : undefined
            }
          />
          <DataRow
            label="Captured environment"
            value={
              silo.acoustic.dhtValid &&
              silo.acoustic.capturedTemperatureC != null &&
              silo.acoustic.capturedHumidityPct != null
                ? `${silo.acoustic.capturedTemperatureC.toFixed(1)}°C · ${
                    silo.acoustic.capturedHumidityPct
                  }% RH`
                : 'DHT reading unavailable'
            }
          />
        </Panel>

        {/* ── Vision ───────────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader
            label="Surface damage"
            icon="camera"
            onPress={() =>
              navigation.navigate('VisionHistory', { siloId: silo.id })
            }
            actionLabel="Open scan history"
            right={
              <StatusMark
                band={
                  visionAvailable ? bandOf(damage, 'damagePercent') : 'idle'
                }
                label={visionAvailable ? percent(damage) : 'No scan'}
                muted
              />
            }
          />

          {visionAvailable ? (
            <>
              <View style={styles.chart}>
                <ProportionBar
                  total={silo.vision.sampleSize}
                  remainderLabel="Sound"
                  segments={[
                    {
                      key: 'bore',
                      label: 'Bore holes',
                      value: silo.vision.boreHoles,
                      color: colors.critical,
                    },
                    {
                      key: 'disc',
                      label: 'Discoloration',
                      value: silo.vision.discoloration,
                      color: colors.caution,
                    },
                    {
                      key: 'mould',
                      label: 'Mould',
                      value: silo.vision.mould,
                      color: colors.plot,
                    },
                    {
                      key: 'frag',
                      label: 'Fragments',
                      value: silo.vision.fragmentation,
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

              <Divider style={styles.rule} />
              <DataRow
                label="Sample"
                value={`${silo.vision.sampleSize} kernels`}
                hint={ago(silo.vision.minutesAgo)}
              />
            </>
          ) : (
            <EmptyState
              icon="camera-off"
              title="No vision result"
              body="Capture and analyse a grain photo to create the first live result."
            />
          )}
        </Panel>

        {/* ── Provenance ───────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader label="Data provenance" icon="cpu" />
          <DataRow
            label="Sensor node"
            value={silo.nodeId}
            hint={
              silo.nodeOnline
                ? 'online'
                : silo.hasReported === false
                  ? 'waiting for first reading'
                  : `no frame for ${ago(silo.minutesAgo)}`
            }
          />
          <DataRow
            label="Gateway"
            value={facility.gatewayId}
            hint={`firmware ${facility.firmware}`}
          />
          <DataRow
            label="Acoustic model"
            value={silo.acoustic.modelName}
            hint={silo.acoustic.modelVersion}
          />
          <DataRow label="Vision model" value={silo.vision.model} />
        </Panel>
      </View>
    </Screen>
  );
}

function Stat({
  label,
  value,
  tint,
  mono = false,
}: {
  label: string;
  value: string;
  tint?: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          mono ? styles.statValueMono : styles.statValue,
          !!tint && { color: tint },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { paddingHorizontal: gutter, paddingBottom: space.lg },
  fleet: {
    flexDirection: 'row',
    paddingHorizontal: gutter,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { ...type.label, color: colors.textTertiary },
  statValue: {
    ...type.reading,
    ...tabular,
    color: colors.text,
    marginTop: space.xxs,
  },
  statValueMono: {
    ...type.mono,
    ...tabular,
    color: colors.textSecondary,
    marginTop: space.sm,
  },

  body: { paddingHorizontal: gutter },
  first: { marginTop: space.xl },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.lg },
  chart: { marginTop: space.lg },

  gaugeWrap: { alignItems: 'center', marginTop: space.lg },
  gaugeCaption: {
    ...type.monoSm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: space.md,
  },

  subscores: { flexDirection: 'row', gap: space.md },
  subscore: { flex: 1, minWidth: 0 },
  subLabel: { ...type.label, color: colors.textTertiary },
  subValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
    marginTop: space.xs,
  },
  subValue: { ...type.reading, ...tabular },
  subWeight: { ...type.monoSm, ...tabular, color: colors.textTertiary },
  subTrack: {
    height: 3,
    backgroundColor: colors.gridline,
    borderRadius: 1,
    marginTop: space.sm,
    overflow: 'hidden',
  },
  subFill: { height: '100%', borderRadius: 1 },
  subLimit: { ...type.monoSm, color: colors.textTertiary, marginTop: space.sm },

  method: {
    ...type.bodySm,
    color: colors.textTertiary,
    marginTop: space.lg,
  },

  actions: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  action: { flex: 1 },

  headerMeta: { ...type.monoSm, ...tabular, color: colors.textTertiary },

  grid: { flexDirection: 'row', gap: space.lg, marginTop: space.lg },

  forecast: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  forecastText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});

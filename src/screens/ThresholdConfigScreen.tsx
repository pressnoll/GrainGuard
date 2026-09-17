import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';

import { bandColor } from '../core/format';
import {
  clamp,
  DEFAULT_LIMITS,
  DEFAULT_THRESHOLDS,
  type MetricKey,
  type Silo,
  type ThresholdMap,
} from '../core/monitoring';
import {
  colors,
  gutter,
  HIT_SLOP,
  radius,
  space,
  tabular,
  type,
} from '../core/theme';
import {
  useFacilityStore,
  useSilos,
  useThresholds,
} from '../state/facilityStore';

/**
 * One editable limit per row. `read` returns null when that channel has no live
 * evidence, so a missing sensor can never appear on the rail as a zero.
 */
const ROWS: Array<{
  metric: MetricKey;
  title: string;
  icon: string;
  unit: string;
  step: number;
  precision: number;
  blurb: string;
  read: (s: Silo) => number | null;
}> = [
  {
    metric: 'temperatureC',
    title: 'Grain temperature',
    icon: 'thermometer',
    unit: '°C',
    step: 1,
    precision: 0,
    blurb:
      'Insect development rate roughly doubles for every 5°C above the limit.',
    read: s =>
      s.environment.temperatureAvailable ? s.environment.temperatureC : null,
  },
  {
    metric: 'relativeHumidity',
    title: 'Interstitial humidity',
    icon: 'droplet',
    unit: '%',
    step: 1,
    precision: 0,
    blurb:
      'Storage moulds become viable above roughly 65% RH between the kernels.',
    read: s =>
      s.environment.humidityAvailable
        ? s.environment.relativeHumidity
        : null,
  },
  {
    metric: 'moistureContent',
    title: 'Grain moisture',
    icon: 'cloud-drizzle',
    unit: '% wb',
    step: 0.5,
    precision: 1,
    blurb:
      'Measured on the grain, not in the air. 13% is the conventional long-term ceiling.',
    read: s =>
      s.environment.moistureAvailable ? s.environment.moistureContent : null,
  },
  {
    metric: 'damagePercent',
    title: 'Surface damage',
    icon: 'camera',
    unit: '%',
    step: 1,
    precision: 0,
    blurb: 'Share of a vision sample showing any defect.',
    read: s =>
      s.vision.sampleSize > 0
        ? ((s.vision.boreHoles +
            s.vision.discoloration +
            s.vision.fragmentation +
            s.vision.mould) /
            s.vision.sampleSize) *
          100
        : null,
  },
];

export default function ThresholdConfigScreen({ navigation }: any) {
  const silos = useSilos();
  const saved = useThresholds();
  const persist = useFacilityStore(s => s.saveThresholds);

  const [limits, setLimits] = useState<ThresholdMap>(saved);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt the stored limits — but not over unsaved edits. A snapshot landing
  // mid-adjustment must not pull the number out from under the operator's thumb.
  useEffect(() => {
    if (!dirty) setLimits(saved);
  }, [saved, dirty]);

  const changed = useMemo(
    () => ROWS.filter(r => limits[r.metric] !== saved[r.metric]).length,
    [limits, saved],
  );

  const offDefault = useMemo(
    () => ROWS.some(r => limits[r.metric] !== DEFAULT_THRESHOLDS[r.metric]),
    [limits],
  );

  const adjust = (metric: MetricKey, delta: number, step: number) => {
    // Bounds come from the shipped defaults, never from the limits currently in
    // force: clamping against a value the operator just raised would let the
    // operating range ratchet upward one save at a time.
    const { floor, hard } = DEFAULT_LIMITS[metric];
    setDirty(true);
    setError(null);
    setLimits(prev => {
      // Rounded against the step so repeated halves cannot drift into
      // floating-point noise, and clamped so the control cannot leave the
      // metric's operating range — the previous steppers did neither.
      const next = clamp(prev[metric] + delta * step, floor, hard);
      return { ...prev, [metric]: Math.round(next / step) * step };
    });
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const message = await persist(limits);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setDirty(false);
    navigation.goBack();
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label={
              changed
                ? `Save ${changed} change${changed > 1 ? 's' : ''}`
                : 'Save thresholds'
            }
            icon="check"
            loading={saving}
            disabled={changed === 0}
            onPress={() => {
              onSave();
            }}
          />
        </View>
      }
    >
      <AppBar
        eyebrow="Alert configuration"
        title="Thresholds"
        onBack={() => navigation.goBack()}
        right={
          offDefault ? (
            <Pressable
              onPress={() => {
                setDirty(true);
                setLimits(DEFAULT_THRESHOLDS);
              }}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Restore default thresholds"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.reset}>Reset</Text>
            </Pressable>
          ) : undefined
        }
      />

      <View style={styles.body}>
        <Text style={styles.intro}>
          An alert is raised when a reading passes the limit set here. Defaults
          follow published safe-storage guidance for tropical stores; the rail
          under each control shows where your probes currently sit against it.
        </Text>

        {error ? (
          <View style={styles.notice}>
            <Notice
              tone="caution"
              title="Not saved to the store"
              detail={`${error} The limits are active on this device in the meantime.`}
            />
          </View>
        ) : null}

        {ROWS.map((row, i) => {
          const value = limits[row.metric];
          const { floor, hard } = DEFAULT_LIMITS[row.metric];
          const readings = silos.flatMap(s => {
            const reading = row.read(s);
            return reading == null ? [] : [{ probe: s, value: reading }];
          });
          const breaching = readings.filter(reading => reading.value > value);
          const isDefault = value === DEFAULT_THRESHOLDS[row.metric];

          return (
            <Panel
              key={row.metric}
              style={i === 0 ? styles.first : styles.block}
            >
              <PanelHeader
                label={row.title}
                icon={row.icon}
                right={
                  isDefault ? (
                    <Text style={styles.meta}>default</Text>
                  ) : (
                    <Text style={styles.metaChanged}>edited</Text>
                  )
                }
              />

              <View style={styles.stepper}>
                <Step
                  icon="minus"
                  label={`Decrease ${row.title}`}
                  onPress={() => adjust(row.metric, -1, row.step)}
                  disabled={value <= floor}
                />
                <View style={styles.valueWrap}>
                  <Text style={styles.value} allowFontScaling={false}>
                    {value.toFixed(row.precision)}
                  </Text>
                  <Text style={styles.unit}>{row.unit}</Text>
                </View>
                <Step
                  icon="plus"
                  label={`Increase ${row.title}`}
                  onPress={() => adjust(row.metric, 1, row.step)}
                  disabled={value >= hard}
                />
              </View>

              <LimitRail
                floor={floor}
                hard={hard}
                limit={value}
                marks={readings.map(reading => ({
                  code: reading.probe.code,
                  value: reading.value,
                  over: reading.value > value,
                }))}
                unit={row.unit}
                precision={row.precision}
              />

              <Divider style={styles.rule} />

              <View style={styles.impact}>
                <Icon
                  name={
                    readings.length === 0
                      ? 'minus'
                      : breaching.length
                        ? 'alert-triangle'
                        : 'check'
                  }
                  size={13}
                  color={
                    readings.length === 0
                      ? colors.textTertiary
                      : breaching.length
                        ? colors.caution
                        : colors.ok
                  }
                />
                <Text style={styles.impactText}>
                  {readings.length === 0
                    ? 'No live reading is available for this channel.'
                    : breaching.length === 0
                      ? 'The probe is inside this limit right now.'
                      : `The probe breaches this limit now — ${breaching
                          .map(reading => reading.probe.code)
                          .join(', ')}.`}
                </Text>
              </View>

              <Text style={styles.blurb}>{row.blurb}</Text>
            </Panel>
          );
        })}
      </View>
    </Screen>
  );
}

function Step({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.step,
        pressed && styles.pressed,
        disabled && styles.stepOff,
      ]}
    >
      <Icon
        name={icon}
        size={18}
        color={disabled ? colors.textTertiary : colors.text}
      />
    </Pressable>
  );
}

/**
 * Operating range for the metric with the chosen limit marked, and each silo's
 * current reading plotted against it.
 */
function LimitRail({
  floor,
  hard,
  limit,
  marks,
  unit,
  precision,
}: {
  floor: number;
  hard: number;
  limit: number;
  marks: Array<{ code: string; value: number; over: boolean }>;
  unit: string;
  precision: number;
}) {
  const span = hard - floor;
  const pos = (v: number) => ((clamp(v, floor, hard) - floor) / span) * 100;

  return (
    <View style={styles.rail}>
      <View style={styles.track}>
        <View style={[styles.safe, { width: `${pos(limit)}%` }]} />
        <View style={[styles.limit, { left: `${pos(limit)}%` }]} />
        {marks.map(mark => (
          <View
            key={mark.code}
            style={[
              styles.mark,
              {
                left: `${pos(mark.value)}%`,
                backgroundColor: mark.over
                  ? bandColor('critical').line
                  : colors.plot,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.railScale}>
        <Text style={styles.scaleText}>
          {floor}
          {unit}
        </Text>
        <Text style={styles.scaleText}>
          limit {limit.toFixed(precision)}
          {unit}
        </Text>
        <Text style={styles.scaleText}>
          {hard}
          {unit}
        </Text>
      </View>

      <Text style={styles.marksLegend}>
        {marks.map(m => `${m.code} ${m.value.toFixed(precision)}`).join('   ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter },
  first: { marginTop: space.lg },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.md },
  pressed: { opacity: 0.6 },

  intro: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xs },
  notice: { marginTop: space.lg },
  reset: { ...type.label, color: colors.accent },
  meta: { ...type.monoSm, color: colors.textTertiary },
  metaChanged: { ...type.monoSm, color: colors.accent },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.4 },
  valueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  value: { ...type.readingLg, ...tabular, color: colors.text },
  unit: { ...type.unit, color: colors.textSecondary },

  rail: { marginTop: space.lg },
  track: {
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.surfaceSunken,
    overflow: 'visible',
  },
  safe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.okWash,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  limit: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.accent,
  },
  mark: {
    position: 'absolute',
    top: 3,
    width: 4,
    height: 4,
    marginLeft: -2,
    borderRadius: 1,
  },
  railScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  scaleText: { ...type.monoSm, ...tabular, color: colors.textTertiary },
  marksLegend: {
    ...type.monoSm,
    ...tabular,
    color: colors.textTertiary,
    marginTop: space.sm,
  },

  impact: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  impactText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  blurb: { ...type.bodySm, color: colors.textTertiary, marginTop: space.sm },

  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});

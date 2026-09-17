import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bandColor } from '../core/format';
import { LIMITS, bandOf, clamp, type MetricKey } from '../core/monitoring';
import { colors, space, tabular, type } from '../core/theme';

/**
 * Linear band gauge.
 *
 * The track is the full operating range for the metric, split into the safe /
 * caution / critical zones, with a marker at the current reading. Unlike a
 * progress ring, the reader can see both the value AND how much headroom is
 * left before the next threshold — which is the actual question when you are
 * deciding whether to run aeration tonight.
 */
export function ThresholdBar({
  metric,
  value,
  height = 8,
  showScale = false,
  unit = '',
}: {
  metric: MetricKey;
  value: number;
  height?: number;
  showScale?: boolean;
  unit?: string;
}) {
  const { floor, ok, caution, hard } = LIMITS[metric];
  const span = hard - floor;
  const pct = ((clamp(value, floor, hard) - floor) / span) * 100;
  const marker = bandColor(bandOf(value, metric)).line;

  return (
    <View>
      <View style={[styles.track, { height }]}>
        <View style={[styles.zone, { flex: ok - floor, backgroundColor: colors.okWash }]} />
        <View style={[styles.zone, { flex: caution - ok, backgroundColor: colors.cautionWash }]} />
        <View style={[styles.zone, { flex: hard - caution, backgroundColor: colors.criticalWash }]} />

        {/* Threshold ticks sit on the boundaries so the zones are readable
            without relying on colour alone. */}
        <View style={[styles.tick, { left: `${((ok - floor) / span) * 100}%` }]} />
        <View style={[styles.tick, { left: `${((caution - floor) / span) * 100}%` }]} />

        <View style={[styles.marker, { left: `${pct}%`, backgroundColor: marker }]} />
      </View>

      {showScale ? (
        <View style={styles.scale}>
          <Text style={styles.scaleText}>
            {floor}
            {unit}
          </Text>
          <Text style={styles.scaleText}>
            limit {ok}
            {unit}
          </Text>
          <Text style={styles.scaleText}>
            {hard}
            {unit}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  zone: { height: '100%' },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineStrong,
  },
  marker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 3,
    marginLeft: -1.5,
    borderRadius: 1,
  },
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  scaleText: { ...type.monoSm, ...tabular, color: colors.textTertiary },
});

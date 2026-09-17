import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LIMITS, type MetricKey } from '../core/monitoring';
import { colors, space, tabular, type } from '../core/theme';

/**
 * Column series with the safe limit drawn across it.
 *
 * A trend line on its own tells you the direction; the limit rule tells you
 * whether the direction matters. The final column is emphasised because "where
 * are we now" is the first question asked of any trend.
 */
export function Sparkline({
  series,
  metric,
  height = 76,
  unit = '',
  columns = 12,
  caption,
}: {
  series: number[];
  metric: MetricKey;
  height?: number;
  unit?: string;
  columns?: number;
  /** Left axis caption. Defaults to the two-hourly telemetry cadence. */
  caption?: string;
}) {
  const data = series.slice(-columns);
  const limit = LIMITS[metric].ok;

  const rawLo = Math.min(...data, limit);
  const rawHi = Math.max(...data, limit);
  const pad = Math.max((rawHi - rawLo) * 0.18, 0.5);
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const norm = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <View>
      <View style={[styles.well, { height }]}>
        {/* Safe-limit rule, dashed by alternating segments so it renders the
            same on both platforms. */}
        <View style={[styles.limit, { bottom: `${norm(limit)}%` }]} pointerEvents="none">
          {Array.from({ length: 32 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dash,
                i % 2 === 0 && styles.dashOn,
              ]}
            />
          ))}
        </View>

        <View style={styles.columns}>
          {data.map((v, i) => {
            const last = i === data.length - 1;
            const over = v > limit;
            return (
              <View key={i} style={styles.slot}>
                <View
                  style={[
                    styles.column,
                    {
                      height: `${Math.max(norm(v), 2)}%`,
                      backgroundColor: last
                        ? over
                          ? colors.caution
                          : colors.plot
                        : over
                        ? colors.cautionWash
                        : colors.plotMuted,
                    },
                    last && styles.columnLast,
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisText}>
          {caption ?? `${data.length} live readings · oldest to newest`}
        </Text>
        <Text style={styles.axisText}>
          limit {limit}
          {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  limit: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    height: StyleSheet.hairlineWidth,
  },
  dash: { flex: 1, height: StyleSheet.hairlineWidth },
  dashOn: { backgroundColor: colors.hairlineStrong },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    gap: 3,
  },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  column: { width: '100%', borderRadius: 1 },
  columnLast: { borderRadius: 1 },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  axisText: { ...type.monoSm, ...tabular, color: colors.textTertiary },
});

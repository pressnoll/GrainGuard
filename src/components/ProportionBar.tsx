import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, space, tabular, type } from '../core/theme';

export type Segment = { key: string; label: string; value: number; color: string };

/**
 * Stacked proportion bar with an optional keyed legend.
 *
 * Used for sample composition and fill level. Segments are separated by a
 * hairline rather than by gaps, so the bar still reads as one whole.
 */
export function ProportionBar({
  segments,
  total,
  height = 10,
  remainderLabel,
  remainderColor = colors.plotMuted,
  legend = true,
}: {
  segments: Segment[];
  total: number;
  height?: number;
  remainderLabel?: string;
  remainderColor?: string;
  legend?: boolean;
}) {
  const used = segments.reduce((s, x) => s + x.value, 0);
  const remainder = Math.max(total - used, 0);

  return (
    <View>
      <View style={[styles.track, { height }]}>
        {segments
          .filter(s => s.value > 0)
          .map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.segment,
                { flex: s.value, backgroundColor: s.color },
                i > 0 && styles.segmentDivider,
              ]}
            />
          ))}
        {remainder > 0 ? (
          <View style={{ flex: remainder, backgroundColor: remainderColor }} />
        ) : null}
      </View>

      {legend ? (
        <View style={styles.legend}>
          {segments.map(s => (
            <View key={s.key} style={styles.item}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.itemLabel}>{s.label}</Text>
              <Text style={styles.itemValue}>{s.value}</Text>
            </View>
          ))}
          {remainderLabel && remainder > 0 ? (
            <View style={styles.item}>
              <View style={[styles.swatch, { backgroundColor: remainderColor }]} />
              <Text style={styles.itemLabel}>{remainderLabel}</Text>
              <Text style={styles.itemValue}>{remainder}</Text>
            </View>
          ) : null}
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
  segment: { borderLeftWidth: 0 },
  segmentDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.surfaceSunken,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space.md,
    rowGap: space.sm,
    columnGap: space.lg,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 7, height: 7, borderRadius: 1 },
  itemLabel: { ...type.monoSm, color: colors.textSecondary },
  itemValue: { ...type.monoSm, ...tabular, color: colors.text, fontWeight: '700' },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bandColor } from '../core/format';
import type { Band } from '../core/monitoring';
import { colors, space, tabular, type } from '../core/theme';

/**
 * Acoustic envelope, drawn symmetrically about a centre line.
 *
 * The samples come from the reading itself, so the trace is stable between
 * renders. The previous version generated bar heights with Math.random() inside
 * render, which meant the "waveform" changed every time React re-rendered and
 * showed nothing about the recording.
 */
export function Waveform({
  envelope,
  band,
  height = 88,
  threshold,
  caption,
}: {
  envelope: number[];
  band: Band;
  height?: number;
  /** The classifier threshold from the model metadata. */
  threshold: number;
  caption?: string;
}) {
  const { line } = bandColor(band);
  const half = height / 2;

  return (
    <View>
      <View style={[styles.well, { height }]}>
        <View style={styles.axis} pointerEvents="none" />

        <View style={[styles.rule, { top: half - half * threshold }]} pointerEvents="none">
          {Array.from({ length: 40 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dash,
                i % 2 === 0 && styles.dashOn,
              ]}
            />
          ))}
        </View>

        <View style={styles.bars}>
          {envelope.map((v, i) => {
            const peak = v >= threshold;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: Math.max(v * height, 2),
                    backgroundColor: peak ? line : colors.plotMuted,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>{caption ?? `${envelope.length} model outputs`}</Text>
        <Text style={styles.legendText}>model threshold {threshold.toFixed(2)}</Text>
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
    justifyContent: 'center',
  },
  axis: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gridline,
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    height: StyleSheet.hairlineWidth,
  },
  dash: { flex: 1, height: StyleSheet.hairlineWidth },
  dashOn: { backgroundColor: colors.hairlineStrong },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
    gap: 2,
  },
  bar: { flex: 1, borderRadius: 1 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  legendText: { ...type.monoSm, ...tabular, color: colors.textTertiary },
});

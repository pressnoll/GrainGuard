import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bandColor } from '../core/format';
import type { Band } from '../core/monitoring';
import { clamp } from '../core/monitoring';
import { colors, space, tabular, type } from '../core/theme';

const TICKS = 44;
const SWEEP = 240; // degrees, gap at the bottom
const START = -SWEEP / 2;

/**
 * Graduated tick dial for the health index.
 *
 * Built from rotated Views rather than SVG — the project has no SVG renderer
 * and this avoids adding a native dependency for one component. Each tick is a
 * full-size overlay rotated about the dial centre, which puts its child on the
 * circumference without any trigonometry.
 *
 * The lit arc is proportional to the score and carries the band colour, and
 * the 50 / 80 grade boundaries are marked, so the dial reads as a measurement
 * rather than as decoration.
 */
export function TickGauge({
  value,
  band,
  size = 188,
  caption,
  footnote,
}: {
  value: number;
  band: Band;
  size?: number;
  caption: string;
  footnote?: string;
}) {
  const score = clamp(value, 0, 100);
  const lit = Math.round((score / 100) * TICKS);
  const { line } = bandColor(band);
  const step = SWEEP / (TICKS - 1);

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel={`Grain health index ${score} of 100, ${caption}`}
    >
      {Array.from({ length: TICKS }, (_, i) => {
        const at = (i / (TICKS - 1)) * 100;
        const isBoundary = crossesGrade(at, step, TICKS);
        const isLit = i < lit;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={[styles.spoke, { transform: [{ rotate: `${START + i * step}deg` }] }]}
          >
            <View
              style={[
                styles.tick,
                isBoundary && styles.tickBoundary,
                {
                  backgroundColor: isLit
                    ? line
                    : isBoundary
                      ? colors.hairlineStrong
                      : colors.gridline,
                },
              ]}
            />
          </View>
        );
      })}

      <View style={styles.center} pointerEvents="none">
        <View style={styles.valueRow}>
          <Text style={styles.value} allowFontScaling={false}>
            {score}
          </Text>
          <Text style={styles.denom}>/100</Text>
        </View>
        <Text style={[styles.caption, { color: line }]}>{caption}</Text>
        {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      </View>
    </View>
  );
}

/** True when a tick sits on the 50 or 80 grade boundary. */
function crossesGrade(at: number, step: number, ticks: number) {
  const halfStep = 100 / (ticks - 1) / 2;
  return [50, 80].some(g => Math.abs(at - g) <= halfStep);
}

const styles = StyleSheet.create({
  spoke: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
  },
  tick: { width: 2, height: 11, borderRadius: 1 },
  tickBoundary: { height: 18 },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x3l,
  },
  valueRow: { flexDirection: 'row', alignItems: 'flex-start' },
  value: { ...type.display, ...tabular, color: colors.text },
  denom: {
    ...type.monoSm,
    ...tabular,
    color: colors.textTertiary,
    marginTop: space.sm,
    marginLeft: space.xxs,
  },
  caption: { ...type.label, marginTop: space.xs },
  footnote: {
    ...type.monoSm,
    color: colors.textTertiary,
    marginTop: space.sm,
    textAlign: 'center',
  },
});

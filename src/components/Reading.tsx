import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { bandColor } from '../core/format';
import { bandOf, type MetricKey, type Trend } from '../core/monitoring';
import { colors, space, tabular, type } from '../core/theme';
import { ThresholdBar } from './ThresholdBar';

const TREND_ICON: Record<Trend, string> = {
  rising: 'trending-up',
  falling: 'trending-down',
  steady: 'minus',
};

/**
 * A single instrument readout: caption, figure, unit, trend and — where the
 * metric has thresholds — the band gauge underneath it.
 *
 * Trend direction is shown with an arrow as well as colour, because "rising" is
 * information a colour-blind reader still needs.
 */
export function Reading({
  label,
  value,
  unit,
  metric,
  numeric,
  trend,
  gauge = true,
  precision = 1,
  available = true,
}: {
  label: string;
  /** Pre-formatted display value. Falls back to `numeric` when omitted. */
  value?: string;
  unit?: string;
  metric: MetricKey;
  numeric: number;
  trend?: Trend;
  gauge?: boolean;
  precision?: number;
  /** False renders an explicit missing value and suppresses trend/threshold claims. */
  available?: boolean;
}) {
  const band = bandOf(numeric, metric);
  const { line } = available ? bandColor(band) : { line: colors.textTertiary };
  const shown = available ? value ?? numeric.toFixed(precision) : '—';

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {available && trend ? (
          <Icon
            name={TREND_ICON[trend]}
            size={13}
            color={trend === 'steady' ? colors.textTertiary : line}
          />
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: line }]} allowFontScaling={false}>
          {shown}
        </Text>
        {available && unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      {available && gauge ? (
        <ThresholdBar metric={metric} value={numeric} height={6} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  label: { ...type.label, color: colors.textTertiary, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  value: { ...type.readingLg, ...tabular },
  unit: { ...type.unit, color: colors.textTertiary },
});

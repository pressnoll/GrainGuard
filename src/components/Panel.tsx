import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radius, space, tabular, type } from '../core/theme';

/**
 * A ruled panel. Separation comes from a hairline and a surface value step,
 * never a drop shadow — shadows are what make a data screen look like a
 * consumer card stack.
 */
export function Panel({
  children,
  style,
  sunken = false,
  inset = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  sunken?: boolean;
  inset?: boolean;
}) {
  return (
    <View
      style={[
        styles.panel,
        sunken && styles.panelSunken,
        inset && styles.panelInset,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Panel caption. The uppercase mono label is the system's organising device,
 * used instead of coloured icon tiles.
 */
export function PanelHeader({
  label,
  icon,
  right,
  onPress,
  actionLabel,
}: {
  label: string;
  icon?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  actionLabel?: string;
}) {
  const inner = (
    <View style={styles.header}>
      {icon ? <Icon name={icon} size={13} color={colors.textTertiary} /> : null}
      <Text style={styles.headerLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.headerRight}>{right}</View>
      {onPress ? <Icon name="chevron-right" size={15} color={colors.textTertiary} /> : null}
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={actionLabel ?? label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {inner}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/**
 * Label/value line. Values use tabular numerals so a stack of rows aligns
 * down the right edge.
 */
export function DataRow({
  label,
  value,
  valueColor,
  mono = true,
  hint,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Text
        style={[
          mono ? styles.rowValueMono : styles.rowValue,
          tabular,
          !!valueColor && { color: valueColor },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  panelSunken: { backgroundColor: colors.surfaceSunken },
  panelInset: { padding: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 20,
  },
  headerLabel: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  headerRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  pressed: { opacity: 0.6 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.sm,
  },
  rowLabelWrap: { flex: 1, minWidth: 0 },
  rowLabel: { ...type.bodySm, color: colors.textSecondary },
  rowHint: { ...type.monoSm, color: colors.textTertiary, marginTop: space.xxs },
  rowValue: { ...type.body, color: colors.text, fontWeight: '600' },
  rowValueMono: { ...type.mono, color: colors.text, fontWeight: '600' },
});

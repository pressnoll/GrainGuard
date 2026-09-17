import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, MIN_TAP, space, tabular, type } from '../core/theme';

/**
 * List row used across Settings and the detail screens.
 *
 * Icons sit bare on the surface at a single size and weight. The previous
 * design put every icon in its own tinted rounded tile, which spent colour on
 * decoration and left none available to mean anything.
 */
export function NavRow({
  icon,
  label,
  detail,
  value,
  onPress,
  right,
  danger = false,
}: {
  icon?: string;
  label: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const tint = danger ? colors.critical : colors.text;

  const body = (
    <View style={styles.row}>
      {icon ? (
        <Icon
          name={icon}
          size={17}
          color={danger ? colors.critical : colors.textSecondary}
          style={styles.icon}
        />
      ) : null}

      <View style={styles.text}>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>

      {value ? <Text style={styles.value}>{value}</Text> : null}
      {right}
      {onPress && !right ? (
        <Icon name="chevron-right" size={17} color={colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TAP,
    paddingVertical: space.md,
    gap: space.md,
  },
  icon: { width: 20, textAlign: 'center' },
  text: { flex: 1, minWidth: 0 },
  label: { ...type.body, fontWeight: '500' },
  detail: { ...type.bodySm, color: colors.textTertiary, marginTop: space.xxs },
  value: { ...type.mono, ...tabular, color: colors.textSecondary },
  pressed: { opacity: 0.6 },
});

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, MIN_TAP, radius, space, type } from '../core/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Actions are rectangles with a small radius. Brand gold is reserved for the
 * single primary action on a screen, which is what makes it read as primary.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inert = disabled || loading;
  const fg = FOREGROUND[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        VARIANT[variant],
        pressed && !inert && PRESSED[variant],
        inert && styles.inert,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={16} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={16} color={fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const VARIANT: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: {
    backgroundColor: colors.criticalWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.critical,
  },
};

const PRESSED: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accentPressed },
  secondary: { backgroundColor: colors.surface },
  ghost: { backgroundColor: colors.surface },
  danger: { backgroundColor: 'rgba(199, 68, 54, 0.24)' },
};

const FOREGROUND: Record<Variant, string> = {
  primary: colors.textInverse,
  secondary: colors.text,
  ghost: colors.textSecondary,
  danger: colors.critical,
};

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { ...type.button },
  inert: { opacity: 0.45 },
});

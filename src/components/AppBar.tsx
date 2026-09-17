import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, gutter, HIT_SLOP, MIN_TAP, radius, space, type } from '../core/theme';

type IconButtonProps = {
  name: string;
  label: string;
  onPress: () => void;
  badge?: number;
  tint?: string;
};

/** Square icon affordance. Square, not circular — no pills anywhere. */
export function IconButton({ name, label, onPress, badge, tint }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <Icon name={name} size={18} color={tint ?? colors.textSecondary} />
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

type Props = {
  /** Uppercase mono line above the title. Context, not decoration. */
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Hairline rule beneath the bar. Off when a segmented control follows. */
  divider?: boolean;
};

export function AppBar({ eyebrow, title, onBack, right, divider = true }: Props) {
  return (
    <View style={[styles.bar, divider && styles.barDivided]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.back, pressed && styles.iconBtnPressed]}
        >
          <Icon name="chevron-left" size={22} color={colors.text} />
        </Pressable>
      ) : null}

      <View style={styles.titles}>
        {eyebrow ? (
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          style={styles.title}
          numberOfLines={1}
          accessibilityRole="header"
          allowFontScaling
        >
          {title}
        </Text>
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  barDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  back: {
    width: 32,
    height: MIN_TAP,
    marginLeft: -space.sm,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titles: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.label, color: colors.textTertiary, marginBottom: space.xxs },
  title: { ...type.titleLg, color: colors.text },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBtn: {
    width: MIN_TAP,
    height: MIN_TAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  iconBtnPressed: { backgroundColor: colors.surfaceRaised, opacity: 0.9 },
  badge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.critical,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.monoSm, color: '#fff', fontWeight: '700', letterSpacing: 0 },
});

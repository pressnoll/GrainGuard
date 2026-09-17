import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { colors, radius, space, type } from '../core/theme';

type Tone = 'critical' | 'caution' | 'ok' | 'info';

/**
 * An inline message about the state of the app itself — a failed sign-in, a
 * pending write, or a live-data connection failure.
 *
 * It sits in the layout rather than floating over it: these messages explain
 * what the operator is looking at, so they must survive long enough to be read
 * and must not cover the thing they are describing. A severity stripe on the
 * leading edge carries the tone, so it stays legible without colour alone.
 */
export function Notice({
  tone = 'info',
  title,
  detail,
  actionLabel,
  onAction,
  onDismiss,
}: {
  tone?: Tone;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const scheme = TONES[tone];

  return (
    <View
      accessibilityRole="alert"
      style={[styles.root, { backgroundColor: scheme.wash, borderColor: scheme.edge }]}
    >
      <View style={[styles.stripe, { backgroundColor: scheme.fg }]} />

      <Icon name={scheme.icon} size={14} color={scheme.fg} style={styles.icon} />

      <View style={styles.body}>
        <Text style={[styles.title, { color: scheme.fg }]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}

        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={[styles.actionLabel, { color: scheme.fg }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          hitSlop={10}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Icon name="x" size={14} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const TONES: Record<Tone, { fg: string; wash: string; edge: string; icon: string }> = {
  critical: {
    fg: colors.critical,
    wash: colors.criticalWash,
    edge: 'rgba(199, 68, 54, 0.34)',
    icon: 'alert-octagon',
  },
  caution: {
    fg: colors.caution,
    wash: colors.cautionWash,
    edge: 'rgba(208, 138, 33, 0.34)',
    icon: 'alert-triangle',
  },
  ok: {
    fg: colors.ok,
    wash: colors.okWash,
    edge: 'rgba(78, 158, 106, 0.34)',
    icon: 'check-circle',
  },
  info: {
    fg: colors.textSecondary,
    wash: colors.surfaceRaised,
    edge: colors.hairlineStrong,
    icon: 'info',
  },
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    paddingRight: space.md,
    paddingLeft: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: space.xs },
  title: { ...type.label },
  detail: { ...type.bodySm, color: colors.textSecondary },
  action: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' },
  actionLabel: { ...type.label },
  pressed: { opacity: 0.6 },
});

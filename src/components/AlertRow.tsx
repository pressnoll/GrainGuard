import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { bandColor } from '../core/format';
import { BAND_LABEL, type Alert } from '../core/monitoring';
import { colors, space, type } from '../core/theme';

const MODALITY_ICON: Record<Alert['modality'], string> = {
  environment: 'thermometer',
  acoustic: 'activity',
  vision: 'camera',
  node: 'cpu',
};

/**
 * One derived alert.
 *
 * Every alert states what was measured, what it was measured against, and what
 * to do about it. Severity is carried by a rule down the leading edge plus a
 * mono label, so it survives greyscale and colour-blindness.
 */
export function AlertRow({
  alert,
  onPress,
  context,
}: {
  alert: Alert;
  onPress?: () => void;
  /** Optional mono qualifier — silo code, timestamp — shown beside severity. */
  context?: string;
}) {
  const { line } = bandColor(alert.band);

  const body = (
    <View style={styles.row}>
      <View style={[styles.rule, { backgroundColor: line }]} />
      <View style={styles.content}>
        <View style={styles.head}>
          <Icon name={MODALITY_ICON[alert.modality]} size={13} color={colors.textTertiary} />
          <Text style={[styles.severity, { color: line }]}>{BAND_LABEL[alert.band]}</Text>
          {context ? <Text style={styles.context}>{context}</Text> : null}
          {onPress ? (
            <View style={styles.chev}>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </View>
          ) : null}
        </View>

        <Text style={styles.title}>{alert.title}</Text>
        <Text style={styles.detail}>{alert.detail}</Text>

        <View style={styles.action}>
          <Icon name="corner-down-right" size={12} color={colors.textTertiary} />
          <Text style={styles.actionText}>{alert.action}</Text>
        </View>
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${BAND_LABEL[alert.band]}: ${alert.title}. ${alert.detail}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  rule: { width: 2, borderRadius: 1 },
  content: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  severity: { ...type.label },
  context: { ...type.monoSm, color: colors.textTertiary },
  chev: { flex: 1, alignItems: 'flex-end' },
  title: { ...type.title, color: colors.text, marginTop: space.sm },
  detail: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.sm,
  },
  actionText: { ...type.bodySm, color: colors.textTertiary, flex: 1, fontStyle: 'italic' },
  pressed: { opacity: 0.65 },
});

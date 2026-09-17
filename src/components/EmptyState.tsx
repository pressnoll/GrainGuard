import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, space, type } from '../core/theme';

/**
 * Empty and all-clear states. An empty list is a result, so it gets a plain
 * statement of what was checked rather than a shrug.
 */
export function EmptyState({
  icon,
  title,
  body,
  tint = colors.textTertiary,
}: {
  icon: string;
  title: string;
  body?: string;
  tint?: string;
}) {
  return (
    <View style={styles.wrap} accessibilityLabel={`${title}. ${body ?? ''}`}>
      <Icon name={icon} size={20} color={tint} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.xl, gap: space.sm },
  title: { ...type.title, color: colors.text, textAlign: 'center' },
  body: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
});

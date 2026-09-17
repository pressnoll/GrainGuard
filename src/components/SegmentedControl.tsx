import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, MIN_TAP, space, type } from '../core/theme';

export type Segment = { key: string; label: string };

/**
 * Underline tab strip.
 *
 * This is the app's only mode switch. It replaces the rounded "pill" selectors
 * the screens used to carry: the active state is an underline plus a weight
 * change, which is how native platform tabs and print running heads have
 * always signalled selection.
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  align = 'start',
}: {
  items: Segment[];
  value: string;
  onChange: (key: string) => void;
  align?: 'start' | 'fill';
}) {
  return (
    <View style={styles.strip} accessibilityRole="tablist">
      {items.map(item => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={({ pressed }) => [
              styles.tab,
              align === 'fill' && styles.tabFill,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
            <View style={[styles.underline, active && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  tab: {
    minHeight: MIN_TAP,
    justifyContent: 'center',
    marginRight: space.xxl,
  },
  tabFill: { flex: 1, marginRight: 0, alignItems: 'center' },
  pressed: { opacity: 0.6 },
  label: { ...type.label, color: colors.textTertiary, paddingBottom: space.sm },
  labelActive: { color: colors.text },
  underline: {
    height: 2,
    backgroundColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  underlineActive: { backgroundColor: colors.accent },
});

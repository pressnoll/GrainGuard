import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { bandColor } from '../core/format';
import type { Band } from '../core/monitoring';
import { colors, space, type } from '../core/theme';

/**
 * State indicator. A hard-edged square with a mono caption, deliberately not a
 * filled rounded chip — state is read from the mark and the label, and colour
 * is never the only carrier of meaning.
 */
export function StatusMark({
  band,
  label,
  size = 8,
  pulse = false,
  muted = false,
}: {
  band: Band;
  label?: string;
  size?: number;
  pulse?: boolean;
  muted?: boolean;
}) {
  const { line } = bandColor(band);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, opacity]);

  return (
    <View style={styles.wrap} accessibilityLabel={label ? `Status: ${label}` : undefined}>
      <Animated.View
        style={[
          styles.mark,
          { width: size, height: size, backgroundColor: line },
          pulse && { opacity },
        ]}
      />
      {label ? (
        <Text style={[styles.label, { color: muted ? colors.textSecondary : line }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Vertical severity rule down the leading edge of an alert row. */
export function SeverityRule({ band }: { band: Band }) {
  return <View style={[styles.rule, { backgroundColor: bandColor(band).line }]} />;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: { borderRadius: 1 },
  label: { ...type.label },
  rule: { width: 2, alignSelf: 'stretch', borderRadius: 1 },
});

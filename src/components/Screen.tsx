import React from 'react';
import {
  View,
  ScrollView,
  StatusBar,
  StyleSheet,
  RefreshControl,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../core/theme';

type Props = {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. Off for viewfinders and fixed layouts. */
  scroll?: boolean;
  /**
   * Apply the bottom safe-area inset. Screens inside the tab navigator pass
   * false — the tab bar already reserves that space.
   */
  bottomInset?: boolean;
  /** Rendered outside the scroll area, pinned above the bottom inset. */
  footer?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Every screen's shell. Owns the ground colour, the status-bar appearance and
 * the safe-area insets, so no screen has to guess at a platform offset.
 */
export function Screen({
  children,
  scroll = true,
  bottomInset = true,
  footer,
  onRefresh,
  refreshing = false,
  contentStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = bottomInset ? insets.bottom : 0;

  const body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[
        { paddingTop: insets.top, paddingBottom: bottom + space.x4l },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, { paddingTop: insets.top }, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {body}
      {footer ? <View style={{ paddingBottom: bottom }}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  fill: { flex: 1 },
});

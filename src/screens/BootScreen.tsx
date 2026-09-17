import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { colors, radius, space, type } from '../core/theme';

/**
 * What the app shows while the session is being resolved.
 *
 * Deliberately the same ground and wordmark as the native launch screen, so the
 * handover from the OS splash to React is a continuation rather than a cut. The
 * spinner is delayed by a moment's worth of nothing — an instant resolve, which
 * is the common case for a signed-in user, should not flash a loading state.
 */
export default function BootScreen() {
  const [showSpinner, setShowSpinner] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setShowSpinner(true), 450);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.mark}>
        <Icon name="shield" size={20} color={colors.accent} />
      </View>
      <Text style={styles.wordmark} allowFontScaling={false}>
        GrainGuard
      </Text>

      <View style={styles.spinner}>
        {showSpinner ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { ...type.reading, color: colors.text, letterSpacing: 0.6 },
  // Fixed height so the layout does not jump when the spinner appears.
  spinner: { height: 20, justifyContent: 'center', marginTop: space.xl },
});

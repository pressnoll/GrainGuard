import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BackgroundVideo } from '../components/BackgroundVideo';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';

import { colors, gutter, radius, space, tabular, type } from '../core/theme';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../state/authStore';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function AuthScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const busy = useAuthStore(s => s.busy);
  const error = useAuthStore(s => s.error);
  const notice = useAuthStore(s => s.notice);
  const configProblem = useAuthStore(s => s.configProblem);
  const googleReady = useAuthStore(s => s.googleReady);
  const signIn = useAuthStore(s => s.signIn);
  const signInGoogle = useAuthStore(s => s.signInGoogle);
  const resetPassword = useAuthStore(s => s.resetPassword);
  const clearMessages = useAuthStore(s => s.clearMessages);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Errors only appear after a submit attempt, so the form is not scolding
  // someone who is still halfway through typing.
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => {
    const out: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) out.email = 'Enter a complete address, e.g. name@store.com';
    if (password.length < MIN_PASSWORD) out.password = `At least ${MIN_PASSWORD} characters.`;
    return out;
  }, [email, password]);

  const valid = Object.keys(errors).length === 0;

  const submit = () => {
    setSubmitted(true);
    if (!valid || busy) return;
    // No navigation on success: the auth listener swaps the route map. See
    // src/navigation/AppNavigator.tsx.
    signIn(email.trim(), password);
  };

  const onReset = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setSubmitted(true);
      return;
    }
    resetPassword(email.trim());
  };

  const onGoogle = () => {
    if (busy) return;
    signInGoogle();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <BackgroundVideo />

      {/* Layered scrim: even dimming plus a heavier base so the console reads
          against moving footage without washing the whole frame out. */}
      <View style={styles.scrimEven} pointerEvents="none" />
      <View style={styles.scrimBaseSoft} pointerEvents="none" />
      <View style={styles.scrimBase} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.x4l }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Masthead ───────────────────────────────────────────── */}
          <Animated.View entering={FadeIn.duration(600)} style={styles.masthead}>
            <View style={styles.markRow}>
              <View style={styles.mark}>
                <Icon name="shield" size={18} color={colors.accent} />
              </View>
              <Text style={styles.wordmark} allowFontScaling={false}>
                GrainGuard
              </Text>
            </View>

            <Text style={styles.pitch}>
              Acoustic, visual and environmental sensing on one grain store — so spoilage is caught
              while the lot can still be saved.
            </Text>

            {/* No store exists before sign-in, so nothing here may name one. */}
            <View style={styles.strap}>
              <Icon name="hard-drive" size={12} color={colors.textTertiary} />
              <Text style={styles.strapText}>
                Records sync to your store · readable offline
              </Text>
            </View>
          </Animated.View>

          {/* ── Console ────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.duration(520).delay(120)}
            style={[styles.console, { paddingBottom: insets.bottom + space.xl }]}
          >
            {configProblem ? (
              <View style={styles.message}>
                <Notice tone="critical" title="Build not configured" detail={configProblem} />
              </View>
            ) : null}

            {error ? (
              <View style={styles.message}>
                <Notice
                  tone="critical"
                  title="Could not sign in"
                  detail={error}
                  onDismiss={clearMessages}
                />
              </View>
            ) : null}

            {notice ? (
              <View style={styles.message}>
                <Notice tone="ok" title="Sent" detail={notice} onDismiss={clearMessages} />
              </View>
            ) : null}

            <View style={styles.form}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={submitted ? errors.email : undefined}
                placeholder="name@store.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
              />

              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                error={submitted ? errors.password : undefined}
                secure
                autoCapitalize="none"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>

            <View style={styles.actions}>
              <Button
                label="Sign in"
                icon="log-in"
                loading={busy}
                onPress={submit}
              />

              {googleReady ? (
                <>
                  <View style={styles.divider}>
                    <View style={styles.dividerRule} />
                    <Text style={styles.dividerLabel}>or</Text>
                    <View style={styles.dividerRule} />
                  </View>

                  <Button
                    label="Continue with Google"
                    icon="chrome"
                    variant="secondary"
                    disabled={busy}
                    onPress={onGoogle}
                  />
                </>
              ) : null}

              <Pressable
                onPress={onReset}
                accessibilityRole="button"
                accessibilityLabel="Reset your password"
                style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
              >
                <Text style={styles.link}>Reset password</Text>
              </Pressable>
            </View>

            <View style={styles.consoleFooter}>
              <View style={styles.offline}>
                <Icon name="wifi-off" size={12} color={colors.textTertiary} />
                <Text style={styles.offlineText}>Scanning works offline</Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('About')}
                accessibilityRole="button"
                accessibilityLabel="About GrainGuard"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.link}>About this build</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'flex-end' },

  scrimEven: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,15,13,0.52)' },
  scrimBaseSoft: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    backgroundColor: 'rgba(11,15,13,0.45)',
  },
  scrimBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '34%',
    backgroundColor: 'rgba(11,15,13,0.72)',
  },

  masthead: { paddingHorizontal: gutter, paddingBottom: space.x3l },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mark: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentEdge,
    backgroundColor: 'rgba(7,10,8,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { ...type.reading, color: colors.text, letterSpacing: 0.6 },
  pitch: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: space.lg,
    maxWidth: 420,
  },
  strap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  strapText: { ...type.monoSm, ...tabular, color: colors.textTertiary },

  console: {
    backgroundColor: 'rgba(18,22,20,0.96)',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
    paddingHorizontal: gutter,
    paddingTop: space.xl,
  },
  message: { marginTop: space.lg },
  form: { gap: space.lg, marginTop: space.xl },
  actions: { gap: space.lg, marginTop: space.xl },

  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dividerRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  dividerLabel: { ...type.monoSm, color: colors.textTertiary },

  linkRow: { alignSelf: 'center', minHeight: 28, justifyContent: 'center' },
  link: { ...type.label, color: colors.accent },
  terms: { ...type.bodySm, color: colors.textTertiary },
  pressed: { opacity: 0.6 },

  consoleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  offlineText: { ...type.monoSm, color: colors.textTertiary },
});

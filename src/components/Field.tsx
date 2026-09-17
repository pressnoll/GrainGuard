import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, HIT_SLOP, MIN_TAP, radius, space, type } from '../core/theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  /** Adds a reveal toggle and manages secureTextEntry internally. */
  secure?: boolean;
};

/**
 * Labelled text field. The label is always visible rather than a placeholder
 * that vanishes on focus — a form you can still read after you start typing.
 */
export function Field({ label, error, hint, secure, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>

      <View
        style={[
          styles.box,
          focused && styles.boxFocused,
          !!error && styles.boxError,
        ]}
      >
        <TextInput
          {...rest}
          style={[styles.input, style]}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={secure ? !revealed : rest.secureTextEntry}
          onFocus={e => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          accessibilityLabel={label}
          selectionColor={colors.accent}
        />
        {secure ? (
          <Pressable
            onPress={() => setRevealed(v => !v)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={styles.reveal}
          >
            <Icon name={revealed ? 'eye-off' : 'eye'} size={16} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Icon name="alert-circle" size={12} color={colors.critical} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...type.label, color: colors.textSecondary },
  hint: { ...type.monoSm, color: colors.textTertiary },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TAP,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: space.md,
  },
  boxFocused: { borderColor: colors.accentEdge, backgroundColor: colors.surface },
  boxError: { borderColor: colors.critical },
  input: {
    flex: 1,
    ...type.body,
    fontSize: 15,
    color: colors.text,
    paddingVertical: space.md,
  },
  reveal: { width: 32, height: MIN_TAP, alignItems: 'flex-end', justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  errorText: { ...type.bodySm, color: colors.critical, flex: 1 },
});

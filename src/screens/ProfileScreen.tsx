import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { NavRow } from '../components/NavRow';
import { Notice } from '../components/Notice';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { StatusMark } from '../components/StatusMark';

import { colors, gutter, radius, space, tabular, type } from '../core/theme';
import { dayOf } from '../services/mappers';
import { useAuthStore } from '../state/authStore';
import {
  useFacility,
  useFacilityStore,
  useSilos,
} from '../state/facilityStore';

/**
 * Three fields, two documents.
 *
 * Name and phone belong to the person, so they go to `users/{uid}`. The
 * organization belongs to the store, so it goes to the facility document as its
 * operator. The screen hides that split — the operator is editing "my details" —
 * but the save has to honour it, which is why it runs two writes and reports the
 * first failure rather than claiming success.
 *
 * The email address is shown, not edited. Changing a sign-in address means
 * verifying the new one before the old one stops working, and a field that
 * silently fails to do that is worse than no field.
 */

/** Initials for the monogram tile — no photo upload exists yet, so don't imply one. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PROVIDER_LABEL: Record<string, string> = {
  password: 'Email and password',
  'google.com': 'Google',
};

/**
 * Firebase hands `creationTime` back as an ISO string on some platforms and a
 * millisecond epoch on others, so parse both. Formatted by hand because Hermes
 * ships without ICU and toLocaleDateString cannot be trusted.
 */
function joinedOn(raw: string | undefined): string | null {
  if (!raw) return null;
  const millis = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(millis)) return null;
  return `${dayOf(millis)} ${new Date(millis).getFullYear()}`;
}

export default function ProfileScreen({ navigation }: any) {
  const profile = useAuthStore(s => s.profile);
  const user = useAuthStore(s => s.user);
  const authError = useAuthStore(s => s.error);
  const authNotice = useAuthStore(s => s.notice);
  const authBusy = useAuthStore(s => s.busy);
  const saveDetails = useAuthStore(s => s.saveDetails);
  const resetPassword = useAuthStore(s => s.resetPassword);
  const clearMessages = useAuthStore(s => s.clearMessages);

  const facility = useFacility();
  const silos = useSilos();
  const renameFacility = useFacilityStore(s => s.renameFacility);

  const email = profile?.email ?? '';
  const role = profile?.role ?? 'Store manager';

  // The stored values, in one object so "dirty" is a comparison rather than
  // four of them.
  const stored = useMemo(
    () => ({
      fullName: profile?.displayName ?? '',
      phone: profile?.phone ?? '',
      organization: facility.operator === '—' ? '' : facility.operator,
    }),
    [profile?.displayName, profile?.phone, facility.operator],
  );

  const [fullName, setFullName] = useState(stored.fullName);
  const [phone, setPhone] = useState(stored.phone);
  const [organization, setOrganization] = useState(stored.organization);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const dirty =
    fullName !== stored.fullName ||
    phone !== stored.phone ||
    organization !== stored.organization;

  // Adopt the stored values when they arrive — the profile document lands a beat
  // after the screen mounts — but never over an edit in progress.
  useEffect(() => {
    if (dirty) return;
    setFullName(stored.fullName);
    setPhone(stored.phone);
    setOrganization(stored.organization);
    // Intentionally keyed on `stored` alone: including `dirty` would re-run the
    // effect the moment an edit makes it true and overwrite that edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (fullName.trim().length < 2)
      out.fullName =
        'A name is required — alerts and reports are signed with it.';
    if (phone.trim() && phone.replace(/\D/g, '').length < 10)
      out.phone = 'Include the country code for a complete contact number.';
    if (!organization.trim())
      out.organization = 'Name the farm or cooperative this store belongs to.';
    return out;
  }, [fullName, phone, organization]);

  const valid = Object.keys(errors).length === 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setFailure(null);

    // Person first, store second. If the profile write fails there is no point
    // renaming the facility — the operator would be left holding a half-applied
    // change with no way to tell which half landed.
    let message = await saveDetails({ displayName: fullName, phone });
    if (!message && organization !== stored.organization) {
      message = await renameFacility({ operator: organization });
    }

    setSaving(false);
    if (message) {
      setFailure(message);
      return;
    }
    navigation.goBack();
  };

  const providers = (user?.providerData ?? [])
    .map(p => PROVIDER_LABEL[p.providerId] ?? p.providerId)
    .filter((label, i, all) => all.indexOf(label) === i);

  const joined = joinedOn(user?.metadata?.creationTime);

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label={dirty ? 'Save changes' : 'No changes to save'}
            icon={dirty ? 'check' : undefined}
            disabled={!dirty || !valid || !profile}
            loading={saving}
            onPress={() => {
              save();
            }}
          />
        </View>
      }
    >
      <AppBar
        eyebrow={facility.name}
        title="Account"
        onBack={() => navigation.goBack()}
        right={dirty ? <Text style={styles.dirty}>unsaved</Text> : undefined}
      />

      <View style={styles.body}>
        {!profile ? (
          <View style={styles.notice}>
            <Notice
              tone="caution"
              title="Not signed in to an account"
              detail="Sign in again before editing account details."
            />
          </View>
        ) : null}

        {failure ? (
          <View style={styles.notice}>
            <Notice
              tone="critical"
              title="Changes not saved"
              detail={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}

        {authNotice ? (
          <View style={styles.notice}>
            <Notice
              tone="ok"
              title="Sent"
              detail={authNotice}
              onDismiss={clearMessages}
            />
          </View>
        ) : authError ? (
          <View style={styles.notice}>
            <Notice
              tone="caution"
              title="Account service"
              detail={authError}
              onDismiss={clearMessages}
            />
          </View>
        ) : null}

        {/* ── Identity ─────────────────────────────────────────────── */}
        <Panel style={styles.first}>
          <View style={styles.identity}>
            <View style={styles.monogram}>
              <Text style={styles.monogramText} allowFontScaling={false}>
                {initials(fullName)}
              </Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {fullName.trim() || 'Unnamed operator'}
              </Text>
              <Text style={styles.role}>{role}</Text>
              <Text style={styles.email} numberOfLines={1}>
                {email || 'no address on file'}
              </Text>
            </View>
          </View>

          <Divider style={styles.rule} />

          <DataRow
            label="Permissions"
            value="Full control of monitoring thresholds and grading"
            mono={false}
          />
          <DataRow
            label="Probe in scope"
            value={silos[0]?.code ?? 'Not connected'}
          />
          <DataRow
            label="Store"
            value={facility.name}
            mono={false}
            hint={facility.region}
          />
        </Panel>

        {/* ── Details ──────────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader label="Contact details" icon="user" />
          <View style={styles.form}>
            <Field
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              error={errors.fullName}
              autoCapitalize="words"
              autoComplete="name"
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              error={errors.phone}
              hint="optional contact"
              keyboardType="phone-pad"
              placeholder="+234 800 000 0000"
            />
            <Field
              label="Organization"
              value={organization}
              onChangeText={setOrganization}
              error={errors.organization}
              hint="facility name"
              autoCapitalize="words"
              placeholder="Cooperative or farm name"
            />
          </View>

          <Divider style={styles.rule} />

          <DataRow
            label="Email"
            value={email || '—'}
            hint={
              user && !user.emailVerified ? 'not verified' : 'sign-in address'
            }
          />

          <View style={styles.noteRow}>
            <Icon
              name="corner-down-right"
              size={13}
              color={colors.textTertiary}
            />
            <Text style={styles.note}>
              This number is optional contact information. The sign-in address
              is fixed here; changing it requires verifying the new address
              before the old one stops working.
            </Text>
          </View>
        </Panel>

        {/* ── Security ─────────────────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader
            label="Security"
            icon="shield"
            right={
              <StatusMark
                band={user?.emailVerified ? 'ok' : 'idle'}
                label={user?.emailVerified ? 'Verified' : 'Unverified'}
                muted={!user?.emailVerified}
              />
            }
          />

          <NavRow
            icon="key"
            label="Change password"
            detail={
              email
                ? `Sends a reset link to ${email}`
                : 'Needs an email address on the account'
            }
            onPress={
              email && !authBusy
                ? () => {
                    resetPassword(email);
                  }
                : undefined
            }
          />

          <Divider style={styles.rule} />

          <DataRow
            label="Sign-in method"
            value={providers.length ? providers.join(', ') : '—'}
            mono={false}
          />
          <DataRow label="Account opened" value={joined ?? '—'} />
          <DataRow label="Account ID" value={profile?.uid ?? '—'} />
        </Panel>

        {/* ── Preferences handoff ──────────────────────────────────── */}
        <Panel style={styles.block}>
          <PanelHeader label="Monitoring" icon="settings" />
          <NavRow
            icon="sliders"
            label="Storage thresholds"
            detail="The limits every alert is measured against"
            onPress={() => navigation.navigate('ThresholdConfig')}
          />
        </Panel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter },
  notice: { marginTop: space.md },
  first: { marginTop: space.md },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.md },
  dirty: { ...type.monoSm, color: colors.accent },

  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  monogram: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentEdge,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    ...type.reading,
    ...tabular,
    color: colors.accent,
    letterSpacing: 1,
  },
  identityText: { flex: 1, minWidth: 0 },
  name: { ...type.titleLg, color: colors.text },
  role: { ...type.label, color: colors.textSecondary, marginTop: space.xs },
  email: { ...type.mono, color: colors.textTertiary, marginTop: space.xs },

  form: { gap: space.lg, marginTop: space.lg },
  noteRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  note: { ...type.bodySm, color: colors.textTertiary, flex: 1 },

  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});

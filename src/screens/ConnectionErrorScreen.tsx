import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { colors, gutter, space, type } from '../core/theme';
import { useAuthError, useAuthStore } from '../state/authStore';
import { useFacilityError } from '../state/facilityStore';

export default function ConnectionErrorScreen() {
  const authError = useAuthError();
  const facilityError = useFacilityError();
  const busy = useAuthStore(state => state.busy);
  const signOut = useAuthStore(state => state.signOut);
  const detail =
    facilityError ||
    authError ||
    'The signed-in account could not open its Firestore facility.';

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label="Sign out and reconnect"
            icon="log-out"
            loading={busy}
            onPress={() => {
              signOut();
            }}
          />
        </View>
      }
    >
      <AppBar eyebrow="Live data" title="Connection required" />
      <View style={styles.body}>
        <Notice tone="critical" title="Firestore access failed" detail={detail} />
        <Panel style={styles.block}>
          <PanelHeader label="What this means" icon="shield" />
          <Text style={styles.text}>
            GrainGuard will not substitute sample readings. Confirm that this
            account's facilityId points to an existing facility whose ownerUid
            or memberUids contains the signed-in Firebase UID, then reconnect.
          </Text>
        </Panel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.lg },
  block: { marginTop: space.lg },
  text: { ...type.bodySm, color: colors.textSecondary, marginTop: space.md },
  footer: {
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});

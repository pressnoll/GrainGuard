import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppBar } from '../components/AppBar';
import { NavRow } from '../components/NavRow';
import { Notice } from '../components/Notice';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { StatusMark } from '../components/StatusMark';
import { ago } from '../core/format';
import { fleetSummary } from '../core/monitoring';
import { colors, gutter, space } from '../core/theme';
import { useAuthStore } from '../state/authStore';
import { useAcousticEvents, useFacility, useFacilityError, useSilos, useVisionScans } from '../state/facilityStore';

export default function SettingsScreen({ navigation }: any) {
  const facility = useFacility();
  const probes = useSilos();
  const events = useAcousticEvents();
  const scans = useVisionScans();
  const facilityError = useFacilityError();
  const profile = useAuthStore(state => state.profile);
  const signOut = useAuthStore(state => state.signOut);
  const authError = useAuthStore(state => state.error);
  const clearMessages = useAuthStore(state => state.clearMessages);
  const fleet = useMemo(() => fleetSummary(probes), [probes]);
  const online = probes.filter(probe => probe.nodeOnline).length;

  const confirmSignOut = () => Alert.alert(
    'Sign out',
    `You will need to sign back in to reach ${facility.name}.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
    ],
  );

  return (
    <Screen bottomInset={false}>
      <AppBar eyebrow={facility.operator} title="Settings" divider={false} />
      <View style={styles.body}>
        {authError ? <View style={styles.notice}><Notice tone="caution" title="Change not saved" detail={authError} onDismiss={clearMessages} /></View> : null}

        <Panel style={styles.first}>
          <PanelHeader label="Operator" icon="user" />
          <NavRow label={profile?.displayName ?? 'Operator'} detail={profile?.email ?? ''} onPress={() => navigation.navigate('Profile')} />
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader label="Probe" icon="radio" right={<StatusMark band={online === 1 ? 'ok' : 'critical'} label={online === 1 ? 'Online' : 'Offline'} />} />
          {probes.map(probe => (
            <DataRow key={probe.id} label={probe.code} value={probe.nodeOnline ? 'Reporting' : probe.hasReported === false ? 'Waiting' : 'Offline'} hint={probe.hasReported === false ? 'No reading received yet' : ago(probe.minutesAgo)} valueColor={probe.nodeOnline ? colors.ok : probe.hasReported === false ? colors.textSecondary : colors.critical} />
          ))}
          <Divider style={styles.rule} />
          <NavRow icon="radio" label="Probe settings" detail="View the probe or edit its name and grain" onPress={() => navigation.navigate('SiloManagement')} />
          <NavRow icon="sliders" label="Monitoring thresholds" detail="Temperature, humidity, moisture and damage limits" onPress={() => navigation.navigate('ThresholdConfig')} />
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader
            label="Live data"
            icon="database"
            right={
              <StatusMark
                band={facilityError ? 'critical' : 'ok'}
                label={facilityError ? 'Sync error' : 'Firestore'}
              />
            }
          />
          <DataRow label="Registered probe" value={probes[0]?.code ?? 'Not connected'} />
          <DataRow label="Latest probe event" value={probes.some(probe => probe.hasReported !== false) ? ago(fleet.freshestMinutes) : 'Waiting for first reading'} />
          <DataRow label="Acoustic detections" value={`${events.length}`} />
          <DataRow label="Vision scans" value={`${scans.length}`} />
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader label="Application" icon="info" />
          <NavRow icon="file-text" label="About GrainGuard" onPress={() => navigation.navigate('About')} />
          <Divider style={styles.rule} />
          <NavRow icon="log-out" label="Sign out" danger onPress={confirmSignOut} />
        </Panel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter }, notice: { marginTop: space.md }, first: { marginTop: space.md },
  block: { marginTop: space.lg }, rule: { marginVertical: space.md },
});

/** Operator-facing registry of real probes. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBar } from '../components/AppBar';
import { NavRow } from '../components/NavRow';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { StatusMark } from '../components/StatusMark';
import { ago } from '../core/format';
import { colors, gutter, space, type } from '../core/theme';
import { useFacility, useSilos } from '../state/facilityStore';

export default function SiloManagementScreen({ navigation }: any) {
  const facility = useFacility();
  const probes = useSilos();
  const online = probes.filter(probe => probe.nodeOnline).length;
  return (
    <Screen>
      <AppBar eyebrow={facility.name} title="Registered probe" onBack={() => navigation.goBack()} right={<StatusMark band={online === 1 ? 'ok' : 'critical'} label={online === 1 ? 'Online' : 'Offline'} />} />
      <View style={styles.body}>
        {probes.map(probe => (
          <Panel key={probe.id} style={styles.block}>
            <PanelHeader label={probe.code} icon="radio" right={<StatusMark band={probe.nodeOnline ? 'ok' : probe.hasReported === false ? 'idle' : 'critical'} label={probe.nodeOnline ? 'Reporting' : probe.hasReported === false ? 'Waiting' : 'Offline'} />} />
            <Text style={styles.name}>{probe.name}</Text>
            <DataRow label="Stored grain" value={probe.crop} mono={false} />
            <DataRow label="Last event" value={probe.hasReported === false ? 'Waiting for first reading' : ago(probe.minutesAgo)} />
            <Divider style={styles.rule} />
            <NavRow icon="edit-3" label="Edit probe" detail="Display name and stored grain" onPress={() => navigation.navigate('SiloEdit', { siloId: probe.id })} />
          </Panel>
        ))}
        <Panel style={styles.block}><PanelHeader label="Live routing" icon="info" /><Text style={styles.explain}>This defence build reads the fixed P01 gateway route automatically. Temperature, humidity and acoustic events remain linked to this probe without a registration step.</Text></Panel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter }, block: { marginTop: space.lg }, name: { ...type.titleLg, color: colors.text, marginTop: space.md },
  rule: { marginVertical: space.md }, explain: { ...type.bodySm, color: colors.textTertiary, marginTop: space.md },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AppBar } from '../components/AppBar';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { HEALTH_WEIGHTS, LIMITS } from '../core/monitoring';
import { colors, gutter, radius, space, tabular, type } from '../core/theme';
import { useSignedIn } from '../state/authStore';
import { useFacility, useSilos } from '../state/facilityStore';

const MODES = [
  { key: 'environment', label: 'Environment', body: 'Live probe temperature and humidity readings.' },
  { key: 'acoustic', label: 'Acoustic', body: 'Gateway feature windows classified locally by the bundled Random Forest.' },
  { key: 'vision', label: 'Vision', body: 'Phone-camera grain images graded locally by the bundled vision model.' },
] as const;

const LIMIT_ROWS = [
  { label: 'Temperature', value: () => LIMITS.temperatureC.ok, unit: '°C' },
  { label: 'Humidity', value: () => LIMITS.relativeHumidity.ok, unit: '% RH' },
  { label: 'Grain moisture', value: () => LIMITS.moistureContent.ok, unit: '% w.b.' },
  { label: 'Surface damage', value: () => LIMITS.damagePercent.ok, unit: '%' },
];

export default function AboutScreen({ navigation }: any) {
  const signedIn = useSignedIn();
  const facility = useFacility();
  const probe = useSilos()[0];

  return (
    <Screen>
      <AppBar title="About GrainGuard" onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <Panel style={styles.first}>
          <View style={styles.identity}>
            <View style={styles.mark}><Icon name="shield" size={22} color={colors.accent} /></View>
            <View style={styles.identityText}>
              <Text style={styles.wordmark}>GrainGuard</Text>
              <Text style={styles.tagline}>Live multimodal grain-health monitoring for probe-instrumented storage.</Text>
            </View>
          </View>
          {signedIn ? <><Divider style={styles.rule} /><DataRow label="Account" value={facility.name} mono={false} /><DataRow label="Registered probe" value={probe?.nodeId ?? 'None'} /></> : null}
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader label="How the health index works" icon="layers" />
          <Text style={styles.explain}>Only available measurements participate in the score. Missing readings are never replaced with sample values or treated as zero.</Text>
          <View style={styles.modes}>
            {MODES.map(mode => <View key={mode.key} style={styles.mode}><Text style={styles.weight}>{Math.round(HEALTH_WEIGHTS[mode.key] * 100)}%</Text><Text style={styles.modeLabel}>{mode.label}</Text><Text style={styles.explain}>{mode.body}</Text></View>)}
          </View>
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader label="Active safe ceilings" icon="sliders" />
          {LIMIT_ROWS.map(row => <DataRow key={row.label} label={row.label} value={`${row.value()} ${row.unit}`} />)}
        </Panel>

        {probe ? <Panel style={styles.block}>
          <PanelHeader label="Live model information" icon="cpu" />
          <DataRow label="Acoustic classifier" value={probe.acoustic.modelName} hint={probe.acoustic.modelVersion} />
          <DataRow label="Vision grader" value={probe.vision.model} />
          <DataRow label="Probe firmware" value={facility.firmware || 'Not reported'} />
        </Panel> : null}

        <Panel style={styles.block}>
          <PanelHeader label="Defence project" icon="book-open" />
          <DataRow label="Institution" value="Federal University of Technology, Minna" mono={false} />
          <DataRow label="Department" value="Computer Engineering" mono={false} />
          <Text style={styles.disclaimer}>GrainGuard provides decision support for the field trial. Confirm important grading or treatment decisions with an appropriate physical inspection or laboratory test.</Text>
        </Panel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter }, first: { marginTop: space.md }, block: { marginTop: space.lg }, rule: { marginVertical: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg }, mark: { width: 46, height: 46, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentEdge, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1 }, wordmark: { ...type.titleLg, color: colors.accent }, tagline: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xs },
  explain: { ...type.bodySm, color: colors.textTertiary, marginTop: space.md }, modes: { marginTop: space.lg, gap: space.lg }, mode: { borderLeftWidth: 2, borderLeftColor: colors.hairlineStrong, paddingLeft: space.md },
  weight: { ...type.reading, ...tabular, color: colors.text }, modeLabel: { ...type.label, color: colors.textSecondary, marginTop: space.xs }, disclaimer: { ...type.bodySm, color: colors.textTertiary, marginTop: space.md },
});

/** Edit operator-facing details for the fixed defence probe. */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { ago } from '../core/format';
import type { Silo } from '../core/monitoring';
import { colors, gutter, space, type } from '../core/theme';
import { useFacilityStore, useSilos } from '../state/facilityStore';

type SelectableCrop = Exclude<Silo['crop'], 'Not set'>;

const CROPS: Array<{ key: SelectableCrop; label: string }> = [
  { key: 'Maize', label: 'Maize' },
  { key: 'Cowpea', label: 'Cowpea' },
  { key: 'Rice', label: 'Rice' },
];

export default function SiloEditScreen({ navigation, route }: any) {
  const internalId: string | undefined = route?.params?.siloId;
  const probes = useSilos();
  const probe = useMemo(
    () => probes.find(item => item.id === internalId) ?? probes[0],
    [internalId, probes],
  );
  const editProbe = useFacilityStore(state => state.editProbe);

  const [name, setName] = useState(probe?.name ?? '');
  const [crop, setCrop] = useState<Silo['crop']>(probe?.crop ?? 'Not set');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const valid = Boolean(probe) && name.trim().length >= 2 && crop !== 'Not set';

  const save = async () => {
    if (!probe || !valid || saving) return;
    setSaving(true);
    setFailure(null);
    const message = await editProbe(probe.id, { name, crop });
    setSaving(false);
    if (message) {
      setFailure(message);
      return;
    }
    navigation.goBack();
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label="Save changes"
            icon="check"
            loading={saving}
            disabled={!valid}
            onPress={() => {
              save();
            }}
          />
        </View>
      }
    >
      <AppBar
        eyebrow={probe?.code ?? 'Probe'}
        title="Edit probe"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.body}>
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

        <Panel style={styles.block}>
          <PanelHeader label="Probe identity" icon="radio" />
          <View style={styles.form}>
            <DataRow label="Probe ID" value={probe?.nodeId ?? 'Unavailable'} />
            <Divider />
            <Field
              label="Display name"
              hint="where this probe is placed"
              value={name}
              onChangeText={setName}
              error={
                name.length > 0 && name.trim().length < 2
                  ? 'Enter at least two characters.'
                  : undefined
              }
              placeholder="Probe location"
            />
            <View>
              <Text style={styles.label}>Stored grain</Text>
              <SegmentedControl
                items={CROPS}
                value={crop}
                onChange={key => setCrop(key as SelectableCrop)}
                align="fill"
              />
              <Text style={styles.note}>
                Select the real stored grain; the app will not assume one.
              </Text>
            </View>
          </View>
        </Panel>

        {probe ? (
          <Panel style={styles.block}>
            <PanelHeader label="Live connection" icon="wifi" />
            <DataRow
              label="Status"
              value={
                probe.nodeOnline
                  ? 'Reporting'
                  : probe.hasReported === false
                    ? 'Waiting for first reading'
                    : 'Offline'
              }
              hint={
                probe.hasReported === false
                  ? 'No event received yet'
                  : `last event ${ago(probe.minutesAgo)}`
              }
              valueColor={
                probe.nodeOnline
                  ? colors.ok
                  : probe.hasReported === false
                    ? colors.textSecondary
                    : colors.critical
              }
            />
          </Panel>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter },
  block: { marginTop: space.lg },
  notice: { marginTop: space.md },
  form: { marginTop: space.lg, gap: space.lg },
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  note: { ...type.bodySm, color: colors.textTertiary, marginTop: space.md },
  footer: {
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});

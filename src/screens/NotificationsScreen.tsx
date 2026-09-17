import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { AlertRow } from '../components/AlertRow';
import { AppBar } from '../components/AppBar';
import { EmptyState } from '../components/EmptyState';
import { NavRow } from '../components/NavRow';
import { Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusMark } from '../components/StatusMark';

import { ago } from '../core/format';
import { deriveAlerts, healthIndex, type Alert } from '../core/monitoring';
import { colors, gutter, space, tabular, type } from '../core/theme';
import { useSilos } from '../state/facilityStore';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'caution', label: 'Caution' },
];

const ROUTES: Record<Alert['modality'], string> = {
  acoustic: 'AcousticDetail',
  vision: 'VisionHistory',
  node: 'SiloManagement',
  environment: 'ThresholdConfig',
};

export default function NotificationsScreen({ navigation }: any) {
  const silos = useSilos();
  const [filter, setFilter] = useState('all');

  const groups = useMemo(
    () =>
      silos.map(silo => ({
        silo,
        health: healthIndex(silo),
        alerts: deriveAlerts(silo),
      })),
    [silos],
  );

  const totals = useMemo(() => {
    const all = groups.flatMap(g => g.alerts);
    return {
      critical: all.filter(a => a.band === 'critical').length,
      caution: all.filter(a => a.band === 'caution').length,
      total: all.length,
    };
  }, [groups]);

  const visible = groups
    .map(g => ({
      ...g,
      alerts: filter === 'all' ? g.alerts : g.alerts.filter(a => a.band === filter),
    }))
    .filter(g => g.alerts.length > 0);

  const clear = groups.filter(g => g.alerts.length === 0);

  return (
    <Screen>
      <AppBar
        eyebrow="Evaluated against your thresholds"
        title="Live alerts"
        onBack={() => navigation.goBack()}
        right={
          <Text style={styles.count}>
            {totals.total} open
          </Text>
        }
      />

      <View style={styles.summary}>
        <Tally label="Critical" value={totals.critical} tint={colors.critical} />
        <Tally label="Caution" value={totals.caution} tint={colors.caution} />
        <Tally
          label="Probe clear"
          value={clear.length}
          tint={clear.length === silos.length ? colors.ok : colors.textSecondary}
        />
      </View>

      <View style={styles.strip}>
        <SegmentedControl items={FILTERS} value={filter} onChange={setFilter} align="fill" />
      </View>

      <View style={styles.body}>
        {visible.length === 0 ? (
          <Panel style={styles.first}>
            <EmptyState
              icon="check-circle"
              tint={colors.ok}
              title={filter === 'all' ? 'Nothing needs attention' : `No ${filter} alerts`}
              body={
                filter === 'all'
                  ? 'Every available reading from the registered probe is inside its band. Alerts appear here when a live reading passes a threshold.'
                  : 'Switch the filter to see alerts at other severities.'
              }
            />
          </Panel>
        ) : (
          visible.map((group, gi) => (
            <Panel key={group.silo.id} style={gi === 0 ? styles.first : styles.block}>
              <PanelHeader
                label={`${group.silo.code} · ${group.silo.name}`}
                icon="alert-triangle"
                right={
                  <StatusMark
                    band={group.health.band}
                    label={`${group.health.index}/100`}
                  />
                }
              />

              {group.alerts.map((alert, i) => (
                <View key={alert.id}>
                  {i > 0 ? <Divider /> : null}
                  <AlertRow
                    alert={alert}
                    context={ago(group.silo.minutesAgo)}
                    onPress={() =>
                      navigation.navigate(ROUTES[alert.modality], { siloId: group.silo.id })
                    }
                  />
                </View>
              ))}
            </Panel>
          ))
        )}

        {clear.length > 0 && visible.length > 0 ? (
          <Panel style={styles.block}>
            <PanelHeader label="Reporting clear" icon="check-circle" />
            {clear.map(group => (
              <NavRow
                key={group.silo.id}
                label={`${group.silo.code} · ${group.silo.name}`}
                detail={`Index ${group.health.index}/100 · ${ago(group.silo.minutesAgo)}`}
                right={<StatusMark band="ok" label="Clear" />}
              />
            ))}
          </Panel>
        ) : null}

        <Panel style={styles.block}>
          <PanelHeader label="Why these appeared" icon="info" />
          <View style={styles.noteRow}>
            <Icon name="corner-down-right" size={13} color={colors.textTertiary} />
            <Text style={styles.note}>
              Each alert is generated by comparing a live reading against the limits you set — none
              of them are scheduled or canned. Change a limit and this list changes with it.
            </Text>
          </View>
          <Divider style={styles.rule} />
          <NavRow
            icon="sliders"
            label="Adjust thresholds"
            onPress={() => navigation.navigate('ThresholdConfig')}
          />
        </Panel>
      </View>
    </Screen>
  );
}

function Tally({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={styles.tally}>
      <Text style={styles.tallyLabel}>{label}</Text>
      <Text style={[styles.tallyValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', paddingHorizontal: gutter, gap: space.xl },
  tally: { flex: 1 },
  tallyLabel: { ...type.label, color: colors.textTertiary },
  tallyValue: { ...type.reading, ...tabular, marginTop: space.xxs },

  strip: { paddingHorizontal: gutter, marginTop: space.lg },
  body: { paddingHorizontal: gutter },
  first: { marginTop: space.xl },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.md },

  count: { ...type.monoSm, ...tabular, color: colors.textTertiary },
  noteRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  note: { ...type.bodySm, color: colors.textTertiary, flex: 1 },
});

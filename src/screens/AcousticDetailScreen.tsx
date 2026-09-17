import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { Screen } from '../components/Screen';
import { StatusMark } from '../components/StatusMark';
import { Waveform } from '../components/Waveform';

import {
  ACOUSTIC_CLASS_LABEL,
  type AcousticClassification,
} from '../core/acoustic';
import { ago, bandColor, percent } from '../core/format';
import { acousticBand, type Band } from '../core/monitoring';
import { colors, gutter, space, tabular, type } from '../core/theme';
import {
  useAcousticEvents,
  useAcousticProcessor,
  useSilo,
} from '../state/facilityStore';

function classificationBand(
  classification: AcousticClassification | null,
): Band {
  if (classification === 'infested') return 'critical';
  if (classification === 'needs_review') return 'caution';
  if (classification === 'clean') return 'ok';
  return 'idle';
}

export default function AcousticDetailScreen({ navigation, route }: any) {
  const silo = useSilo(route?.params?.siloId);
  const selectedEventId = route?.params?.eventId;
  const events = useAcousticEvents();
  const processor = useAcousticProcessor();
  const acoustic = silo.acoustic;
  const band = acousticBand(acoustic);

  const history = useMemo(
    () => events.filter(event => event.siloId === silo.id),
    [events, silo.id],
  );

  return (
    <Screen>
      <AppBar
        eyebrow={`${silo.code} · ${silo.name}`}
        title="Acoustic analysis"
        onBack={() => navigation.goBack()}
        right={
          <StatusMark
            band={band}
            label={
              acoustic.classification
                ? ACOUSTIC_CLASS_LABEL[acoustic.classification]
                : 'No result'
            }
            pulse={band === 'critical'}
          />
        }
      />

      <View style={styles.body}>
        {processor.error ? (
          <Notice
            tone="critical"
            title="Latest acoustic event failed"
            detail={processor.error}
          />
        ) : null}

        <Panel style={styles.first}>
          <PanelHeader
            label="Local classification"
            icon="activity"
            right={
              acoustic.scanId ? (
                <Text style={styles.meta}>{ago(acoustic.minutesAgo)}</Text>
              ) : null
            }
          />

          <View style={styles.headline}>
            <Text
              style={[styles.headlineValue, { color: bandColor(band).line }]}
              allowFontScaling={false}
            >
              {acoustic.probabilityInfested == null
                ? '—'
                : percent(acoustic.probabilityInfested * 100, 0)}
            </Text>
            <Text style={styles.headlineUnit}>infestation probability</Text>
          </View>

          <Divider style={styles.rule} />
          <DataRow
            label="Classification"
            value={
              acoustic.classification
                ? ACOUSTIC_CLASS_LABEL[acoustic.classification]
                : 'No probe-backed result'
            }
            mono={false}
          />
          <DataRow
            label="Event"
            value={acoustic.scanId ?? '—'}
          />
          <DataRow label="Probe" value={acoustic.probeId ?? '—'} />
          <DataRow
            label="Windows"
            value={acoustic.windowCount ? String(acoustic.windowCount) : '—'}
            hint="one second each · 30 features"
          />
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader
            label="Window probabilities"
            icon="bar-chart-2"
            right={
              <Text style={styles.meta}>
                {acoustic.windowProbabilities.length} values
              </Text>
            }
          />
          {acoustic.windowProbabilities.length ? (
            <>
              <View style={styles.chart}>
                <Waveform
                  envelope={acoustic.windowProbabilities}
                  band={band}
                  threshold={acoustic.threshold}
                  height={120}
                  caption="five RF window probabilities · event result is their mean"
                />
              </View>
              {acoustic.windowProbabilities.map((probability, index) => (
                <DataRow
                  key={index}
                  label={`Window ${index + 1}`}
                  value={percent(probability * 100, 1)}
                />
              ))}
            </>
          ) : (
            <Text style={styles.caveat}>No classified window probabilities are available.</Text>
          )}
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader label="Probe context" icon="thermometer" />
          <DataRow
            label="Temperature"
            value={
              acoustic.dhtValid && acoustic.capturedTemperatureC != null
                ? `${acoustic.capturedTemperatureC.toFixed(1)}°C`
                : 'Unavailable'
            }
          />
          <DataRow
            label="Relative humidity"
            value={
              acoustic.dhtValid && acoustic.capturedHumidityPct != null
                ? `${acoustic.capturedHumidityPct.toFixed(1)}% RH`
                : 'Unavailable'
            }
          />
          <DataRow
            label="Battery"
            value={
              acoustic.batteryV == null
                ? '—'
                : `${acoustic.batteryV.toFixed(2)} V`
            }
          />
          <DataRow label="Feature space" value={acoustic.featureSpace} />
          <DataRow
            label="Sample rate"
            value={acoustic.sampleRateHz ? `${acoustic.sampleRateHz} Hz` : '—'}
          />
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader label="Model provenance" icon="cpu" />
          <DataRow
            label="Processor"
            value={
              processor.activeScanId
                ? 'Classifying'
                : processor.error
                  ? 'Failed'
                  : 'Ready'
            }
            mono={false}
          />
          <DataRow
            label="Last processed"
            value={processor.lastProcessedScanId ?? acoustic.scanId ?? '—'}
          />
          <DataRow label="Model" value={acoustic.modelName} />
          <DataRow label="Version" value={acoustic.modelVersion} />
          <DataRow
            label="Decision bands"
            value="<40 clean · 40–70 review · >70 infested"
            mono={false}
          />
          <Text style={styles.caveat}>
            The forest was trained on batch-corrected archival features. Its own
            deployment note permits raw features where a new field session has
            no batch context; results from this probe still require paired field
            validation before treatment decisions are automated.
          </Text>
        </Panel>

        <Panel style={styles.block}>
          <PanelHeader
            label={`History · ${silo.code}`}
            icon="clock"
            right={<Text style={styles.meta}>{history.length} events</Text>}
          />
          {history.map(event => {
            const eventBand = classificationBand(event.classification);
            return (
              <View
                key={event.id}
                style={[
                  styles.history,
                  event.id === selectedEventId && styles.historySelected,
                ]}
              >
                <View style={styles.historyMain}>
                  <Text style={styles.historyTitle}>
                    {event.classification
                      ? ACOUSTIC_CLASS_LABEL[event.classification]
                      : 'Legacy event'}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {event.clock} · {ago(event.minutesAgo)} · {event.probeId}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyValue,
                    { color: bandColor(eventBand).line },
                  ]}
                >
                  {event.probabilityInfested == null
                    ? '—'
                    : percent(event.probabilityInfested * 100, 0)}
                </Text>
              </View>
            );
          })}
          {!history.length ? (
            <Text style={styles.caveat}>
              No classified acoustic events for this probe yet.
            </Text>
          ) : null}
        </Panel>

        <View style={styles.actions}>
          <Button
            label="Probe status"
            icon="radio"
            onPress={() =>
              navigation.navigate('MainApp', { screen: 'Scanner' })
            }
            style={styles.grow}
          />
          <Button
            label="Vision history"
            icon="camera"
            variant="secondary"
            onPress={() =>
              navigation.navigate('VisionHistory', { siloId: silo.id })
            }
            style={styles.grow}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter },
  first: { marginTop: space.md },
  block: { marginTop: space.lg },
  rule: { marginVertical: space.lg },
  chart: { marginTop: space.lg, marginBottom: space.md },
  grow: { flex: 1 },
  meta: { ...type.monoSm, ...tabular, color: colors.textTertiary },
  headline: { alignItems: 'center', marginTop: space.xl },
  headlineValue: { ...type.display, ...tabular },
  headlineUnit: {
    ...type.label,
    color: colors.textTertiary,
    marginTop: space.xs,
  },
  caveat: { ...type.bodySm, color: colors.textTertiary, marginTop: space.lg },
  history: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  historySelected: { backgroundColor: colors.accentWash },
  historyMain: { flex: 1 },
  historyTitle: { ...type.body, color: colors.text },
  historyMeta: {
    ...type.monoSm,
    color: colors.textTertiary,
    marginTop: space.xxs,
  },
  historyValue: { ...type.mono, ...tabular, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.md, marginVertical: space.xl },
});

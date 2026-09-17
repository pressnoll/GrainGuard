import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
} from 'react-native-image-picker';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';

import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { DataRow, Divider, Panel, PanelHeader } from '../components/Panel';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { Waveform } from '../components/Waveform';

import { acousticBand, type Silo } from '../core/monitoring';
import { colors, gutter, radius, space, tabular, type } from '../core/theme';
import {
  analyseVisualPhoto,
  MODEL_INPUT_SIZE,
  MODEL_NAME,
  type GrainType,
} from '../services/visualScanService';
import {
  useAcousticProcessor,
  useSilo,
} from '../state/facilityStore';

const MODES = [
  { key: 'vision', label: 'Vision' },
  { key: 'acoustic', label: 'Acoustic' },
];

const GRAINS: Array<{ key: GrainType; label: string }> = [
  { key: 'beans', label: 'Beans' },
  { key: 'maize', label: 'Maize' },
  { key: 'rice', label: 'Rice' },
  { key: 'wheat', label: 'Wheat' },
  { key: 'sorghum', label: 'Sorghum' },
];

/**
 * What the next capture will actually do. Vision values come from the deployed
 * model manifest and selected route, never from the silo's previous reading.
 */
function specFor(
  mode: string,
  silo: Silo,
  grain: GrainType,
): Array<[string, string]> {
  if (mode === 'acoustic') {
    return [
      ['Source', silo.acoustic.probeId ?? 'Paired remote probe'],
      ['Windows', '5 × 1 second'],
      ['Sample rate', '24 kHz'],
      ['Model', silo.acoustic.modelName],
      ['Features', '5 × 30 DSP features'],
    ];
  }
  return [
    ['Model input', `${MODEL_INPUT_SIZE} × ${MODEL_INPUT_SIZE} RGB`],
    [
      'Analysis',
      grain === 'beans' ? 'Multiple heap views' : 'Detected kernels',
    ],
    ['Model', MODEL_NAME],
    ['Runtime', 'On-device'],
  ];
}

export default function ScannerScreen({ navigation }: any) {
  const acousticProcessor = useAcousticProcessor();

  const [mode, setMode] = useState('vision');
  const [grain, setGrain] = useState<GrainType>('beans');
  const [busy, setBusy] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);

  const sweep = useRef(new Animated.Value(0)).current;

  // The defence deployment has one registered probe, so every scan and
  // acoustic result is routed to it automatically.
  const silo = useSilo(undefined);
  const spec = useMemo(() => specFor(mode, silo, grain), [grain, mode, silo]);

  // Sweep line, vision mode only. It communicates that the camera frame is armed.
  useEffect(() => {
    if (mode !== 'vision' || frameHeight === 0) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [mode, frameHeight, sweep]);

  const analyse = useCallback(
    async (asset: Asset) => {
      if (!asset.uri) {
        Alert.alert(
          'Photo unavailable',
          'Please select or take the photo again.',
        );
        return;
      }
      if (busy) return;
      setBusy(true);
      try {
        // Gallery images may be PNG, WEBP, or HEIC. Normalising them here means
        // the model always receives a JPEG that the on-device decoder understands.
        const jpeg = await ImageResizer.createResizedImage(
          asset.uri,
          2048,
          2048,
          'JPEG',
          90,
          0,
          undefined,
          false,
          { mode: 'contain', onlyScaleDown: true },
        );
        const base64 = await RNFS.readFile(
          jpeg.path.replace(/^file:\/\//, ''),
          'base64',
        );
        const visualResult = await analyseVisualPhoto(base64, grain);
        navigation.navigate('ScanResults', {
          siloId: silo.id,
          mode: 'vision',
          visualResult,
        });
      } catch (error) {
        Alert.alert(
          'Could not analyse photo',
          error instanceof Error ? error.message : 'Try another photo.',
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, grain, navigation, silo.id],
  );

  const capture = useCallback(async () => {
    if (mode !== 'vision') {
      navigation.navigate('AcousticDetail', { siloId: silo.id });
      return;
    }
    const response = await launchCamera({
      mediaType: 'photo',
      cameraType: 'back',
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 0.9,
    });
    if (response.errorMessage)
      Alert.alert('Camera error', response.errorMessage);
    if (response.assets?.[0]) await analyse(response.assets[0]);
  }, [analyse, mode, navigation, silo.id]);

  const importPhoto = useCallback(async () => {
    const response = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 0.9,
      assetRepresentationMode: 'compatible',
    });
    if (response.errorMessage)
      Alert.alert('Photo import error', response.errorMessage);
    if (response.assets?.[0]) await analyse(response.assets[0]);
  }, [analyse]);

  return (
    <Screen
      scroll={false}
      bottomInset={false}
      footer={
        <View style={styles.footer}>
          <Button
            label={
              mode === 'vision'
                ? busy
                  ? 'Analysing frame'
                  : 'Capture frame'
                : acousticProcessor.activeScanId
                ? 'Classifying probe event'
                : 'Open acoustic results'
            }
            icon={mode === 'vision' ? 'camera' : 'activity'}
            loading={
              mode === 'vision' ? busy : acousticProcessor.activeScanId != null
            }
            onPress={capture}
          />
          <Text style={styles.footerNote}>
            {mode === 'vision'
              ? `Result is written to ${silo.code} · ${silo.crop}`
              : 'Probe events arrive and classify automatically'}
          </Text>
        </View>
      }
    >
      <AppBar eyebrow={`Probe ${silo.code}`} title="Scanner" divider={false} />

      <View style={styles.controls}>
        <SegmentedControl
          items={MODES}
          value={mode}
          onChange={setMode}
          align="fill"
        />
      </View>

      <View style={styles.body}>
        {mode === 'vision' ? (
          <View style={styles.grainRow}>
            <Text style={styles.targetLabel}>Grain</Text>
            <View style={styles.grainTabs}>
              <SegmentedControl
                items={GRAINS}
                value={grain}
                onChange={key => setGrain(key as GrainType)}
                align="fill"
              />
            </View>
          </View>
        ) : null}

        {mode === 'vision' ? (
          <View
            style={styles.frame}
            onLayout={e => setFrameHeight(e.nativeEvent.layout.height)}
          >
            {/* Rule-of-thirds guides: alignment aid, and they make the well
                read as an instrument rather than an empty box. */}
            <View style={[styles.guide, styles.guideV, styles.guideOneThirdX]} />
            <View style={[styles.guide, styles.guideV, styles.guideTwoThirdsX]} />
            <View style={[styles.guide, styles.guideH, styles.guideOneThirdY]} />
            <View style={[styles.guide, styles.guideH, styles.guideTwoThirdsY]} />

            <View style={[styles.bracket, styles.bracketTL]} />
            <View style={[styles.bracket, styles.bracketTR]} />
            <View style={[styles.bracket, styles.bracketBL]} />
            <View style={[styles.bracket, styles.bracketBR]} />

            {frameHeight > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.sweep,
                  {
                    transform: [
                      {
                        translateY: sweep.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, frameHeight],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ) : null}

            <View style={styles.frameCentre} pointerEvents="none">
              <Icon name="crosshair" size={18} color={colors.textTertiary} />
              <Text style={styles.frameHint}>
                Spread a single layer of grain across the frame
              </Text>
            </View>
          </View>
        ) : (
          <Panel style={styles.listenPanel}>
            <PanelHeader
              label="Remote probe"
              icon="radio"
              right={
                <Text style={styles.meta}>
                  {acousticProcessor.pending} pending
                </Text>
              }
            />
            {silo.acoustic.windowProbabilities.length ? (
              <View style={styles.listenChart}>
                <Waveform
                  envelope={silo.acoustic.windowProbabilities}
                  band={acousticBand(silo.acoustic)}
                  threshold={silo.acoustic.threshold}
                  height={120}
                  caption={`${silo.acoustic.windowCount} window probabilities · latest event`}
                />
              </View>
            ) : (
              <EmptyState
                icon="activity"
                title="Waiting for acoustic result"
                body="Wake the probe. Its next valid piezo event will be classified automatically."
              />
            )}
            <Text style={styles.listenNote}>
              The ESP32 probe captures the signal, computes 30 features per
              window and sends them through Firestore. This phone classifies the
              event locally; it does not record audio.
            </Text>
            {acousticProcessor.error ? (
              <Text style={[styles.listenNote, { color: colors.critical }]}>
                {acousticProcessor.error}
              </Text>
            ) : null}
          </Panel>
        )}

        <Panel style={styles.spec}>
          <PanelHeader label="Capture specification" icon="settings" />
          <Divider style={styles.rule} />
          {spec.map(([label, value]) => (
            <DataRow key={label} label={label} value={value} />
          ))}
        </Panel>

        {mode === 'vision' ? (
          <Pressable
            onPress={() => {
              importPhoto();
            }}
            accessibilityRole="button"
            accessibilityLabel="Import a photo from the gallery"
            style={({ pressed }) => [
              styles.importRow,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="upload" size={15} color={colors.textSecondary} />
            <Text style={styles.importText}>Import a photo instead</Text>
            <Icon name="chevron-right" size={15} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: gutter },
  body: { flex: 1, paddingHorizontal: gutter, paddingTop: space.lg },

  grainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.md,
  },
  targetLabel: { ...type.label, color: colors.textTertiary },
  grainTabs: { flex: 1 },

  frame: {
    flex: 1,
    marginTop: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  guide: { position: 'absolute', backgroundColor: colors.gridline },
  guideV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  guideH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  guideOneThirdX: { left: '33.33%' },
  guideTwoThirdsX: { left: '66.66%' },
  guideOneThirdY: { top: '33.33%' },
  guideTwoThirdsY: { top: '66.66%' },
  bracket: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: colors.accent,
  },
  bracketTL: { top: 12, left: 12, borderTopWidth: 2, borderLeftWidth: 2 },
  bracketTR: { top: 12, right: 12, borderTopWidth: 2, borderRightWidth: 2 },
  bracketBL: { bottom: 12, left: 12, borderBottomWidth: 2, borderLeftWidth: 2 },
  bracketBR: {
    bottom: 12,
    right: 12,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: colors.accentEdge,
  },
  frameCentre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.x4l,
  },
  frameHint: {
    ...type.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  listenPanel: { marginTop: space.lg },
  listenChart: { marginTop: space.lg },
  listenNote: {
    ...type.bodySm,
    color: colors.textTertiary,
    marginTop: space.lg,
  },
  meta: { ...type.monoSm, ...tabular, color: colors.textTertiary },

  spec: { marginTop: space.lg },
  rule: { marginTop: space.md, marginBottom: space.xs },

  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
  },
  importText: { ...type.body, color: colors.textSecondary, flex: 1 },
  pressed: { opacity: 0.6 },

  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  footerNote: {
    ...type.monoSm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: space.md,
  },
});

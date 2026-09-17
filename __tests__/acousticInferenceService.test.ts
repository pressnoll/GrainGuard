import deployedModel from '../src/assets/models/grain_infestation_rf.json';
import {
  ACOUSTIC_FEATURE_COUNT,
  classifyAcousticProbability,
  inferAcousticEventWithModel,
  type AcousticForestModel,
} from '../src/services/acousticInferenceService';

const leaf = (probability: number) => ({
  l: [-1],
  r: [-1],
  f: [-2],
  t: [-2],
  p: [probability],
});

const splitTree = {
  l: [1, -1, -1],
  r: [2, -1, -1],
  f: [0, -2, -2],
  t: [0.5, -2, -2],
  p: [0, 0.2, 0.8],
};

const model: AcousticForestModel = {
  format: 'grainguard-rf-json-v1',
  name: 'fixture',
  version: 'fixture-v1',
  sourceSha256: 'fixture',
  featureSchema: 1,
  featureSpace: 'raw',
  sampleRateHz: 24000,
  windowSeconds: 1,
  featureNames: [
    ...Array.from({ length: 13 }, (_, index) => `mfcc_mean_${index}`),
    ...Array.from({ length: 13 }, (_, index) => `mfcc_std_${index}`),
    'spectral_centroid',
    'spectral_rolloff',
    'zcr',
    'rms',
  ],
  classes: ['clean', 'infested'],
  infestedClassIndex: 1,
  threshold: 0.55,
  reviewBand: 0.15,
  nTrees: 2,
  notes: '',
  trees: [splitTree, leaf(0.4)],
};

const windowOf = (firstFeature: number) => [
  firstFeature,
  ...Array.from({ length: ACOUSTIC_FEATURE_COUNT - 1 }, () => 0),
];

describe('acoustic Random Forest inference', () => {
  test('uses sklearn <= split semantics and averages trees then windows', () => {
    const result = inferAcousticEventWithModel(model, [
      windowOf(0.5),
      windowOf(0.6),
      windowOf(0.5),
      windowOf(0.6),
      windowOf(0.5),
    ]);

    [0.3, 0.6, 0.3, 0.6, 0.3].forEach((expected, index) => {
      expect(result.windowProbabilities[index]).toBeCloseTo(expected, 12);
    });
    expect(result.probabilityInfested).toBeCloseTo(0.42, 12);
    expect(result.classification).toBe('needs_review');
  });

  test('keeps both review boundaries inclusive', () => {
    expect(classifyAcousticProbability(0.399999, 0.55, 0.15)).toBe('clean');
    expect(classifyAcousticProbability(0.4, 0.55, 0.15)).toBe('needs_review');
    expect(classifyAcousticProbability(0.7, 0.55, 0.15)).toBe('needs_review');
    expect(classifyAcousticProbability(0.700001, 0.55, 0.15)).toBe('infested');
  });

  test('rejects malformed events instead of fabricating a result', () => {
    expect(() => inferAcousticEventWithModel(model, [windowOf(0)])).toThrow(
      'must contain 5 windows',
    );

    const malformed = windowOf(0);
    malformed[7] = Number.NaN;
    expect(() =>
      inferAcousticEventWithModel(model, [
        malformed,
        windowOf(0),
        windowOf(0),
        windowOf(0),
        windowOf(0),
      ]),
    ).toThrow('non-finite feature');
  });

  test('validates and evaluates the deployed 500-tree artifact', () => {
    const zeroWindow = windowOf(0);
    const result = inferAcousticEventWithModel(
      deployedModel as unknown as AcousticForestModel,
      [zeroWindow, zeroWindow, zeroWindow, zeroWindow, zeroWindow],
    );

    expect(result.modelName).toBe('grain_infestation_rf_final');
    expect(result.modelVersion).toBe(
      'sha256:d81555e6b701a24c45d936b4686df1e48492a73321734fc3a0c2490e1bf18314',
    );
    expect(result.windowProbabilities).toHaveLength(5);
    expect(result.probabilityInfested).toBeGreaterThanOrEqual(0);
    expect(result.probabilityInfested).toBeLessThanOrEqual(1);
  });
});

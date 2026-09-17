import type { AcousticClassification } from '../core/acoustic';

export type { AcousticClassification } from '../core/acoustic';

export interface AcousticInferenceResult {
  probabilityInfested: number;
  classification: AcousticClassification;
  windowProbabilities: number[];
  modelName: string;
  modelVersion: string;
  threshold: number;
  reviewBand: number;
}

type AcousticTree = {
  l: number[];
  r: number[];
  f: number[];
  t: number[];
  p: number[];
};

export type AcousticForestModel = {
  format: 'grainguard-rf-json-v1';
  name: string;
  version: string;
  sourceSha256: string;
  featureSchema: 1;
  featureSpace: 'raw';
  sampleRateHz: 24000;
  windowSeconds: 1;
  featureNames: string[];
  classes: string[];
  infestedClassIndex: number;
  threshold: number;
  reviewBand: number;
  nTrees: number;
  notes: string;
  trees: AcousticTree[];
};

export const ACOUSTIC_FEATURE_COUNT = 30;
export const ACOUSTIC_WINDOW_COUNT = 5;

export const ACOUSTIC_FEATURE_NAMES = [
  ...Array.from({ length: 13 }, (_, index) => `mfcc_mean_${index}`),
  ...Array.from({ length: 13 }, (_, index) => `mfcc_std_${index}`),
  'spectral_centroid',
  'spectral_rolloff',
  'zcr',
  'rms',
] as const;

let modelPromise: Promise<AcousticForestModel> | null = null;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateModel(value: unknown): AcousticForestModel {
  if (!value || typeof value !== 'object') {
    throw new Error('The acoustic model asset is not an object.');
  }

  const model = value as Partial<AcousticForestModel>;
  if (
    model.format !== 'grainguard-rf-json-v1' ||
    model.featureSchema !== 1 ||
    model.featureSpace !== 'raw' ||
    model.sampleRateHz !== 24000 ||
    model.windowSeconds !== 1
  ) {
    throw new Error(
      'The acoustic model metadata does not match Feature Schema 1.',
    );
  }

  if (
    !Array.isArray(model.featureNames) ||
    model.featureNames.length !== ACOUSTIC_FEATURE_COUNT ||
    model.featureNames.some(
      (name, index) => name !== ACOUSTIC_FEATURE_NAMES[index],
    )
  ) {
    throw new Error('The acoustic model feature order is invalid.');
  }

  if (
    !Array.isArray(model.classes) ||
    model.classes[model.infestedClassIndex ?? -1] !== 'infested' ||
    !finite(model.threshold) ||
    !finite(model.reviewBand) ||
    typeof model.name !== 'string' ||
    typeof model.version !== 'string' ||
    !Array.isArray(model.trees) ||
    model.trees.length !== model.nTrees ||
    model.trees.length === 0
  ) {
    throw new Error('The acoustic model classifier metadata is invalid.');
  }

  model.trees.forEach((tree, treeIndex) => {
    const size = tree.f?.length ?? 0;
    if (
      size === 0 ||
      tree.l?.length !== size ||
      tree.r?.length !== size ||
      tree.t?.length !== size ||
      tree.p?.length !== size
    ) {
      throw new Error(
        `Acoustic tree ${treeIndex} has inconsistent node arrays.`,
      );
    }
  });

  return model as AcousticForestModel;
}

async function loadModel(): Promise<AcousticForestModel> {
  if (!modelPromise) {
    modelPromise = import('../assets/models/grain_infestation_rf.json').then(
      module => validateModel(module.default ?? module),
    );
  }
  return modelPromise;
}

function validateWindow(window: readonly number[], index: number): void {
  if (window.length !== ACOUSTIC_FEATURE_COUNT) {
    throw new Error(
      `Acoustic window ${index} must contain ${ACOUSTIC_FEATURE_COUNT} features; received ${window.length}.`,
    );
  }
  if (window.some(value => !Number.isFinite(value))) {
    throw new Error(`Acoustic window ${index} contains a non-finite feature.`);
  }
}

/** Evaluate one feature vector using sklearn's exact <= split semantics. */
export function evaluateAcousticWindow(
  model: AcousticForestModel,
  window: readonly number[],
): number {
  validateWindow(window, 0);
  let probabilitySum = 0;

  model.trees.forEach((tree, treeIndex) => {
    let node = 0;
    let steps = 0;

    while (steps <= tree.f.length) {
      const featureIndex = tree.f[node];
      if (!Number.isInteger(featureIndex)) {
        throw new Error(
          `Acoustic tree ${treeIndex} contains an invalid node index.`,
        );
      }
      if (featureIndex < 0) {
        const probability = tree.p[node];
        if (!finite(probability) || probability < 0 || probability > 1) {
          throw new Error(
            `Acoustic tree ${treeIndex} contains an invalid leaf probability.`,
          );
        }
        probabilitySum += probability;
        return;
      }
      if (featureIndex >= ACOUSTIC_FEATURE_COUNT || !finite(tree.t[node])) {
        throw new Error(
          `Acoustic tree ${treeIndex} contains an invalid split.`,
        );
      }

      node = window[featureIndex] <= tree.t[node] ? tree.l[node] : tree.r[node];
      if (!Number.isInteger(node) || node < 0 || node >= tree.f.length) {
        throw new Error(
          `Acoustic tree ${treeIndex} points outside its node arrays.`,
        );
      }
      steps += 1;
    }

    throw new Error(`Acoustic tree ${treeIndex} contains a cycle.`);
  });

  return probabilitySum / model.trees.length;
}

export function classifyAcousticProbability(
  probability: number,
  threshold: number,
  reviewBand: number,
): AcousticClassification {
  if (![probability, threshold, reviewBand].every(Number.isFinite)) {
    throw new Error('Acoustic classification received a non-finite value.');
  }
  if (probability < threshold - reviewBand) return 'clean';
  if (probability > threshold + reviewBand) return 'infested';
  return 'needs_review';
}

export function inferAcousticEventWithModel(
  model: AcousticForestModel,
  windows: readonly (readonly number[])[],
): AcousticInferenceResult {
  if (windows.length !== ACOUSTIC_WINDOW_COUNT) {
    throw new Error(
      `An acoustic event must contain ${ACOUSTIC_WINDOW_COUNT} windows; received ${windows.length}.`,
    );
  }

  windows.forEach(validateWindow);
  const windowProbabilities = windows.map(window =>
    evaluateAcousticWindow(model, window),
  );
  const probabilityInfested =
    windowProbabilities.reduce((sum, probability) => sum + probability, 0) /
    windowProbabilities.length;

  return {
    probabilityInfested,
    classification: classifyAcousticProbability(
      probabilityInfested,
      model.threshold,
      model.reviewBand,
    ),
    windowProbabilities,
    modelName: model.name,
    modelVersion: model.version,
    threshold: model.threshold,
    reviewBand: model.reviewBand,
  };
}

export async function inferAcousticEvent(
  windows: readonly (readonly number[])[],
): Promise<AcousticInferenceResult> {
  return inferAcousticEventWithModel(await loadModel(), windows);
}

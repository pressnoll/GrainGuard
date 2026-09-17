import {
  loadTensorflowModel,
  type ModelSource,
  type TfliteModel,
} from 'react-native-fast-tflite';
import { Image as ReactNativeImage, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { decode } from 'jpeg-js';

import MANIFEST from '../assets/models/deploy_manifest.json';
import RECOMMENDATIONS from '../assets/models/recommendations.json';

export type GrainType = 'beans' | 'maize' | 'rice' | 'wheat' | 'sorghum';

/** How much of a bean heap shows weevil damage, as a word rather than a number. */
export type BeanSeverity = 'clean' | 'light' | 'moderate' | 'severe';

export type VisualScanResult = {
  crop: GrainType;
  route: 'direct' | 'segmented';
  /** Raw dominant class code, e.g. "AP". Kept for the audit trail. */
  prediction: string;
  /** Human-readable name for `prediction`, e.g. "Pest damage". */
  predictionLabel: string;
  confidence: number;
  sampleSize: number;
  counts: Record<string, number>;
  advice: string;
  clean: boolean;
  /**
   * The model was closer to a coin-flip than a call. The verdict still stands
   * and is still filed — it is shown with a warning rather than withheld,
   * because a flagged reading is more use to a farmer than a missing one.
   */
  lowTrust: boolean;
  /** The generic head (sound/damaged/impurity), read as the manifest's cross-check. */
  crossCheck: { code: string; label: string; confidence: number } | null;
  /** Beans only: the measured spread of damage across views of the heap. */
  extent: {
    views: number;
    infestedViews: number;
    percent: number;
    severity: BeanSeverity;
    label: string;
    note: string;
  } | null;
};

/**
 * Everything about the model's own vocabulary comes out of the files it shipped
 * with, so a retrained model that adds a class or reorders its heads needs a new
 * `deploy_manifest.json` and nothing else. The class names carry a training
 * index (`0_NOR`); the recommendations are keyed on the bare code.
 */
type OutputSpec = { head: string; tensor_index: number; tensor_name: string; shape: number[] };

const MANIFEST_OUTPUTS = MANIFEST.tflite.float32.outputs as OutputSpec[];
const HEAD_CLASSES = MANIFEST.heads.classes as Record<string, string[]>;
const GENERIC_CLASSES = MANIFEST.heads.generic as string[];
const INPUT_SHAPE = MANIFEST.input.shape as number[];
const RECOMMENDATION = RECOMMENDATIONS as Record<
  string,
  Record<string, { clean: boolean; advice: string }>
>;

const CLASSES: Record<string, string[]> = Object.fromEntries(
  Object.entries(HEAD_CLASSES).map(([head, names]) => [head, names.map(n => n.replace(/^\d+_/, ''))]),
);

/** The action to take, in the model author's own words. */
function adviceFor(head: string, code: string): string {
  return (
    RECOMMENDATION[head]?.[code]?.advice ??
    'No stored recommendation for this class — confirm with a second sample before acting.'
  );
}

function cleanFor(head: string, code: string): boolean {
  return RECOMMENDATION[head]?.[code]?.clean === true;
}

/**
 * Below this the head is closer to a coin-flip than a call, and the result is
 * badged accordingly. It gates a warning, never the verdict: this is a
 * presentation threshold, not a model parameter.
 */
export const CONFIDENCE_FLOOR = 0.65;

/**
 * Infestation level for beans, by the share of heap views showing damage.
 *
 * The beans head is binary — it answers "is there weevil damage in this view?",
 * not "how much". A level therefore cannot come from its confidence, which
 * measures certainty and not extent; conflating the two would be inventing a
 * figure. Instead the heap is read at several positions and the level is the
 * share of views that came back infested, split at thirds. Any single positive
 * view makes the verdict infested: bruchid damage is patchy, and early
 * localised damage is exactly when treatment still saves the lot.
 */
const SEVERITY: Record<BeanSeverity, { label: string; note: string }> = {
  clean: { label: 'None', note: 'No view of the heap showed weevil damage.' },
  light: {
    label: 'Light',
    note: 'Damage is confined to part of the heap. Treat now, while it is still localised.',
  },
  moderate: {
    label: 'Moderate',
    note: 'Damage runs across much of the heap — an established infestation.',
  },
  severe: {
    label: 'Severe',
    note: 'Damage shows in most views of the heap. The infestation is widespread.',
  },
};

export function severityOf(percentOfViews: number): BeanSeverity {
  if (percentOfViews <= 0) return 'clean';
  if (percentOfViews <= 100 / 3) return 'light';
  if (percentOfViews <= 200 / 3) return 'moderate';
  return 'severe';
}

/**
 * The level table as the result screen shows it, in order. It lives beside
 * `severityOf` so the bands a farmer reads cannot drift from the bands the app
 * actually applies.
 */
export const BEAN_LEVELS: Array<{ key: BeanSeverity; label: string; note: string; range: string }> = [
  { key: 'clean', ...SEVERITY.clean, range: 'no views' },
  { key: 'light', ...SEVERITY.light, range: 'up to 33%' },
  { key: 'moderate', ...SEVERITY.moderate, range: '33–67%' },
  { key: 'severe', ...SEVERITY.severe, range: 'above 67%' },
];

/**
 * Plain-language name for each class code. The model speaks in short codes
 * (`AP`, `F&S`, `MY`, …); a farmer reading the result must never have to. This
 * is the single source of truth for turning a code into words on screen.
 */
const LABELS: Record<string, string> = {
  NOR: 'Sound grain',
  'F&S': 'Fusarium / sprout damage',
  SD: 'Sun / moisture damage',
  MY: 'Mould',
  AP: 'Pest damage',
  BN: 'Broken kernels',
  HD: 'Heat damage',
  UN: 'Under-developed',
  BP: 'Black point',
  IM: 'Impurities',
  clean: 'Clean — no infestation',
  infested: 'Infested — storage weevils',
  sound: 'Sound',
  damaged: 'Damaged',
  impurity: 'Impurity',
};

/** The class code rendered as words, falling back to the code if unmapped. */
export function labelFor(code: string): string {
  return LABELS[code] ?? code;
}

/** Deployment facts shown by the capture/result UI; sourced from the model manifest. */
export const MODEL_NAME = MANIFEST.tflite.float32.file.replace(/\.tflite$/i, '');
export const MODEL_INPUT_SIZE = INPUT_SHAPE[1];

const MODEL_ASSET = require('../assets/models/grainvisual_f32.tflite');

/**
 * In an Android release bundle, React Native resolves a non-image raw resource
 * to its resource name (for example `src_assets_models_grainvisual_f32`) rather
 * than to a URL. fast-tflite's Android loader opens sources with java.net.URL,
 * so handing that bare name to it raises MalformedURLException even though the
 * model is correctly present in res/raw.
 *
 * Copy that packaged resource into the app's private cache once and give the
 * loader a real file:// URL. Development bundles resolve to http:// and iOS
 * resolves its bundle asset normally, so both keep using the package's standard
 * require(...) path.
 */
async function modelSource(): Promise<ModelSource> {
  if (Platform.OS !== 'android') return MODEL_ASSET;

  const resolved = ReactNativeImage.resolveAssetSource(MODEL_ASSET);
  const uri = resolved?.uri;
  if (!uri) throw new Error('The bundled GrainVisual model could not be resolved.');

  // A URL with a scheme is already something the native loader can open.
  if (/^[a-z][a-z\d+.-]*:/i.test(uri)) return MODEL_ASSET;

  const resourceFile = uri.endsWith('.tflite') ? uri : `${uri}.tflite`;
  const cacheName = resourceFile.replace(/[^A-Za-z0-9._-]/g, '_');
  const localPath = `${RNFS.CachesDirectoryPath}/${cacheName}`;
  const present = await RNFS.exists(localPath);
  const valid = present && (await RNFS.stat(localPath)).size > 0;

  if (!valid) {
    const base64 = await RNFS.readFileRes(resourceFile, 'base64');
    await RNFS.writeFile(localPath, base64, 'base64');
  }

  return { url: `file://${localPath}` };
}

let modelPromise: Promise<TfliteModel> | null = null;
function model() {
  modelPromise ??= modelSource().then(source => loadTensorflowModel(source, []));
  return modelPromise;
}

function bytesFromBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const outputLength = Math.floor((clean.length * 3) / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
  const out = new Uint8Array(outputLength);
  let index = 0;
  for (let offset = 0; offset < clean.length; offset += 4) {
    const a = alphabet.indexOf(clean[offset]);
    const b = alphabet.indexOf(clean[offset + 1]);
    const c = clean[offset + 2] === '=' ? 0 : alphabet.indexOf(clean[offset + 2]);
    const d = clean[offset + 3] === '=' ? 0 : alphabet.indexOf(clean[offset + 3]);
    // Decode independent 4-character groups. Keeping one ever-growing number
    // corrupts a photo once JavaScript runs out of integer precision.
    const group = a * 262144 + b * 4096 + c * 64 + d;
    if (index < outputLength) out[index++] = Math.floor(group / 65536) % 256;
    if (index < outputLength) out[index++] = Math.floor(group / 256) % 256;
    if (index < outputLength) out[index++] = group % 256;
  }
  return out;
}

type Image = { width: number; height: number; rgba: Uint8Array };
function pixel(image: Image, x: number, y: number, channel: number) {
  return image.rgba[(y * image.width + x) * 4 + channel];
}

function wholePhotoCrop(image: Image, x: number, y: number, width: number, height: number): Float32Array {
  const input = new Float32Array(224 * 224 * 3);
  for (let oy = 0; oy < 224; oy++) {
    const sy = Math.min(image.height - 1, y + Math.floor((oy / 224) * height));
    for (let ox = 0; ox < 224; ox++) {
      const sx = Math.min(image.width - 1, x + Math.floor((ox / 224) * width));
      const at = (oy * 224 + ox) * 3;
      input[at] = pixel(image, sx, sy, 0) / 255;
      input[at + 1] = pixel(image, sx, sy, 1) / 255;
      input[at + 2] = pixel(image, sx, sy, 2) / 255;
    }
  }
  return input;
}

/** Exact grain-head path: square pad with the crop-border median, resize 256, crop 224. */
function grainTensor(image: Image, x: number, y: number, width: number, height: number): Float32Array {
  const border: number[][] = [[], [], []];
  for (let dx = 0; dx < width; dx++) for (const dy of [0, height - 1]) for (let c = 0; c < 3; c++) border[c].push(pixel(image, x + dx, y + dy, c));
  for (let dy = 1; dy < height - 1; dy++) for (const dx of [0, width - 1]) for (let c = 0; c < 3; c++) border[c].push(pixel(image, x + dx, y + dy, c));
  const fill = border.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  const side = Math.max(width, height); const left = Math.floor((side - width) / 2); const topOffset = Math.floor((side - height) / 2);
  const input = new Float32Array(224 * 224 * 3);
  for (let oy = 0; oy < 224; oy++) for (let ox = 0; ox < 224; ox++) {
    const sourceX = Math.floor(((ox + 16) / 256) * side) - left;
    const sourceY = Math.floor(((oy + 16) / 256) * side) - topOffset;
    const at = (oy * 224 + ox) * 3;
    for (let c = 0; c < 3; c++) input[at + c] = (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height ? fill[c] : pixel(image, x + sourceX, y + sourceY, c)) / 255;
  }
  return input;
}

/**
 * Where to look at a bean heap.
 *
 * Beans were trained on whole-heap photos: shorter edge to 256, then a 224
 * centre crop. One such crop is one opinion about the heap, which is all a
 * binary head can give — so we take that exact crop at several positions
 * instead. Every view is a real training-scale crop, just offset, so all of them
 * are in the distribution the head was fitted on; only the centre one was being
 * used before. The slack along the shorter edge is 32 px by construction, so a
 * square photo yields four views and a 4:3 photo six.
 */
function beansViews(image: Image): Array<{ x: number; y: number; size: number }> {
  const factor = Math.min(image.width, image.height) / 256;
  const size = Math.round(224 * factor);

  // Offsets are chosen in the model's own 256-scaled space, then mapped back to
  // source pixels. Slack is 32 px on the shorter edge by construction and more
  // on the longer one, so the longer edge is what yields the extra views.
  const stops = (sourceExtent: number) => {
    const slack = Math.round(sourceExtent / factor) - 224;
    if (slack <= 0) return [0];
    const scaled = slack < 96 ? [0, slack] : [0, Math.round(slack / 2), slack];
    return scaled.map(offset => Math.round(offset * factor));
  };

  const views: Array<{ x: number; y: number; size: number }> = [];
  for (const y of stops(image.height)) for (const x of stops(image.width)) views.push({ x, y, size });
  return views;
}

/**
 * Mobile port of the simple first stage in inference.md: Otsu thresholding and
 * connected components. It deliberately accepts only separated kernels; the
 * capture screen tells the operator to spread one layer without touching grains.
 */
function kernelBoxes(image: Image): Array<[number, number, number, number]> {
  const count = image.width * image.height;
  const gray = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const value = Math.round(image.rgba[p] * 0.299 + image.rgba[p + 1] * 0.587 + image.rgba[p + 2] * 0.114);
    gray[i] = value; histogram[value]++;
  }
  let total = 0, weighted = 0;
  for (let i = 0; i < 256; i++) { total += histogram[i]; weighted += i * histogram[i]; }
  let below = 0, belowWeight = 0, threshold = 0, best = -1;
  for (let i = 0; i < 256; i++) {
    below += histogram[i]; belowWeight += i * histogram[i];
    const above = total - below;
    if (!below || !above) continue;
    const score = below * above * Math.pow(belowWeight / below - (weighted - belowWeight) / above, 2);
    if (score > best) { best = score; threshold = i; }
  }
  let border = 0, n = 0;
  for (let x = 0; x < image.width; x++) for (const y of [0, image.height - 1]) { border += gray[y * image.width + x]; n++; }
  for (let y = 1; y < image.height - 1; y++) for (const x of [0, image.width - 1]) { border += gray[y * image.width + x]; n++; }
  const darkForeground = border / n > threshold;
  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i++) mask[i] = (darkForeground ? gray[i] < threshold : gray[i] > threshold) ? 1 : 0;
  const seen = new Uint8Array(count); const boxes: Array<[number, number, number, number]> = [];
  const minArea = count * 0.0004, maxArea = count * 0.15;
  for (let start = 0; start < count; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1; let area = 0; let x0 = image.width, y0 = image.height, x1 = 0, y1 = 0;
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q], x = at % image.width, y = Math.floor(at / image.width); area++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const next of [at - 1, at + 1, at - image.width, at + image.width]) if (next >= 0 && next < count && !seen[next] && mask[next] && Math.abs((next % image.width) - x) <= 1) { seen[next] = 1; queue.push(next); }
    }
    if (area >= minArea && area <= maxArea && x1 > x0 + 5 && y1 > y0 + 5) {
      const padX = Math.round((x1 - x0) * 0.15), padY = Math.round((y1 - y0) * 0.15);
      boxes.push([Math.max(0, x0 - padX), Math.max(0, y0 - padY), Math.min(image.width - 1, x1 + padX), Math.min(image.height - 1, y1 + padY)]);
    }
  }
  return boxes;
}

/**
 * Which position in the interpreter's output array each head occupies.
 *
 * This is worth spelling out, because getting it wrong is silent. The manifest
 * lists its heads in the author's own order (the four crops, then generic, then
 * beans) and its reference implementation reads them by *graph tensor id* —
 * `interpreter.get_tensor(198)`. TFLite on device hands back a flat array in
 * subgraph output order instead, and those two numberings are unrelated: sorted
 * by tensor id, beans is first, not last. Reading "index 5" as a position landed
 * on an eight-class grain head, whose argmax can exceed the two beans classes,
 * so the label came back undefined and an infested heap rendered as a blank
 * prediction with a perfect score.
 *
 * So nothing here is positional by assumption. Tensor name is the one identifier
 * the graph and the manifest share; failing that, a head whose output width is
 * unique in the graph (beans at 2, generic at 3) is unambiguous on shape alone.
 * Only the four eight-class crop heads can need the last resort, which is the
 * one ordering TFLite does guarantee — ascending tensor id.
 */
function resolveHeadPositions(
  names: readonly (string | undefined)[],
  widths: readonly number[],
): Record<string, number> {
  const at: Record<string, number> = {};
  const taken = new Set<number>();
  const claim = (head: string, position: number) => {
    at[head] = position;
    taken.add(position);
  };
  const widthOf = (shape: number[]) => shape[shape.length - 1];

  for (const spec of MANIFEST_OUTPUTS) {
    const position = names.findIndex((name, i) => !taken.has(i) && name === spec.tensor_name);
    if (position >= 0) claim(spec.head, position);
  }

  for (const spec of MANIFEST_OUTPUTS) {
    if (at[spec.head] !== undefined) continue;
    const matches = widths.reduce<number[]>(
      (found, width, i) => (!taken.has(i) && width === widthOf(spec.shape) ? [...found, i] : found),
      [],
    );
    if (matches.length === 1) claim(spec.head, matches[0]);
  }

  const unresolved = MANIFEST_OUTPUTS.filter(spec => at[spec.head] === undefined).sort(
    (a, b) => a.tensor_index - b.tensor_index,
  );
  const free = widths.map((_, i) => i).filter(i => !taken.has(i));
  unresolved.forEach((spec, i) => {
    if (free[i] !== undefined && widths[free[i]] === widthOf(spec.shape)) claim(spec.head, free[i]);
  });

  return at;
}

let positions: Record<string, number> | null = null;

/** Every head at once: one `run` produces all six outputs, so a cross-check is free. */
async function runAll(input: Float32Array): Promise<Float32Array[]> {
  const tflite = await model();
  const outputs = await tflite.run([input.buffer as ArrayBuffer]);
  const values = outputs.map(buffer => new Float32Array(buffer));
  if (!positions) {
    positions = resolveHeadPositions(
      tflite.outputs.map(t => t?.name),
      values.map(v => v.length),
    );
    // Logged once. A model swap that shuffles the heads is otherwise invisible
    // until a farmer is looking at a wrong reading.
    console.log('[GrainVisual] heads', positions, 'widths', values.map(v => v.length).join(','));
  }
  return values;
}

/**
 * Read one head, refusing to guess. A width that disagrees with the head's class
 * list means the map is wrong, and a wrong reading dressed as a real one is worse
 * than no reading, so this throws instead of indexing off the end of the list.
 */
function readHead(all: Float32Array[], head: string, classes: string[]) {
  const position = positions?.[head];
  if (position === undefined || !all[position]) {
    throw new Error(`This model does not expose a "${head}" output. Check deploy_manifest.json.`);
  }
  const values = all[position];
  if (values.length !== classes.length) {
    throw new Error(
      `The "${head}" head returned ${values.length} values but ${classes.length} classes are configured. Check deploy_manifest.json.`,
    );
  }
  return top(Array.from(values), classes);
}

function top(values: number[], classes: string[]) {
  const index = values.reduce((best, value, i) => value > values[best] ? i : best, 0);
  // Model output is logits, so softmax is required before showing confidence.
  const max = Math.max(...values); const exp = values.map(v => Math.exp(v - max));
  return { label: classes[index], confidence: exp[index] / exp.reduce((a, b) => a + b, 0) };
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Plurality vote over the generic head, used as the manifest's second opinion. */
function crossCheckOf(readings: Array<{ label: string; confidence: number }>) {
  if (!readings.length) return null;
  const counts: Record<string, number> = {};
  for (const r of readings) counts[r.label] = (counts[r.label] ?? 0) + 1;
  const code = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return {
    code,
    label: labelFor(code),
    confidence: mean(readings.filter(r => r.label === code).map(r => r.confidence)),
  };
}

export async function analyseVisualPhoto(base64: string, crop: GrainType): Promise<VisualScanResult> {
  const decoded = decode(bytesFromBase64(base64), { useTArray: true, formatAsRGBA: true });
  const image: Image = { width: decoded.width, height: decoded.height, rgba: decoded.data };

  if (crop === 'beans') {
    // Several training-scale views of the same heap. The count of views that come
    // back infested is a measured extent, which is what turns a yes/no head into
    // a level the farmer can act on.
    const views = beansViews(image);
    const beans: Array<{ label: string; confidence: number }> = [];
    const generic: Array<{ label: string; confidence: number }> = [];
    for (const view of views) {
      const all = await runAll(wholePhotoCrop(image, view.x, view.y, view.size, view.size));
      beans.push(readHead(all, 'beans', CLASSES.beans));
      generic.push(readHead(all, 'generic', GENERIC_CLASSES));
    }

    const infested = beans.filter(r => r.label === 'infested');
    const label = infested.length ? 'infested' : 'clean';
    const percent = (infested.length / beans.length) * 100;
    const severity = severityOf(percent);
    // Certainty in the verdict itself: how sure the views that carried it were.
    const confidence = mean(
      (label === 'infested' ? infested : beans).map(r => r.confidence),
    );

    return {
      crop,
      route: 'direct',
      prediction: label,
      predictionLabel: labelFor(label),
      confidence,
      sampleSize: beans.length,
      counts: { clean: beans.length - infested.length, infested: infested.length },
      advice: adviceFor('beans', label),
      clean: cleanFor('beans', label),
      lowTrust: confidence < CONFIDENCE_FLOOR,
      crossCheck: crossCheckOf(generic),
      extent: {
        views: beans.length,
        infestedViews: infested.length,
        percent,
        severity,
        label: SEVERITY[severity].label,
        note: SEVERITY[severity].note,
      },
    };
  }

  const boxes = kernelBoxes(image);
  if (!boxes.length) throw new Error('No separate kernels were found. Spread the grain in one layer on a plain contrasting surface, then try again.');
  const counts: Record<string, number> = {};
  const confidences: number[] = [];
  const generic: Array<{ label: string; confidence: number }> = [];
  for (const [x0, y0, x1, y1] of boxes) {
    const all = await runAll(grainTensor(image, x0, y0, x1 - x0, y1 - y0));
    const kernel = readHead(all, crop, CLASSES[crop]);
    counts[kernel.label] = (counts[kernel.label] ?? 0) + 1;
    confidences.push(kernel.confidence);
    generic.push(readHead(all, 'generic', GENERIC_CLASSES));
  }
  const prediction = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const confidence = mean(confidences);
  return {
    crop,
    route: 'segmented',
    prediction,
    predictionLabel: labelFor(prediction),
    confidence,
    sampleSize: boxes.length,
    counts,
    advice: adviceFor(crop, prediction),
    clean: cleanFor(crop, prediction),
    lowTrust: confidence < CONFIDENCE_FLOOR,
    crossCheck: crossCheckOf(generic),
    extent: null,
  };
}

/**
 * Fold the model's class counts into the four legacy defect buckets the history
 * screens and health model understand. The mapping is intentionally lossy — it
 * exists only so a scan feeds the older aggregate views; the authoritative
 * result is `counts`/`prediction` on the scan itself.
 *
 * Beans have no per-kernel classes, so each view of the heap is booked as one
 * sample unit and an infested view as one bore-hole event: cowpea storage
 * weevils bore into the seed, making it the closest of the four buckets. The
 * damage share that falls out is therefore the measured extent — three infested
 * views out of six reads as 50% — rather than the flat 0% or 100% a single
 * whole-photo verdict could produce.
 */
export function visualCountsForHistory(result: VisualScanResult) {
  const count = (key: string) => result.counts[key] ?? 0;
  return {
    boreHoles: count('AP') + count('infested'),
    discoloration: count('F&S') + count('SD') + count('HD') + count('UN') + count('BP'),
    fragmentation: count('BN'),
    mould: count('MY'),
  };
}

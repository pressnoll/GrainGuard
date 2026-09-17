/**
 * GrainGuard monitoring model.
 *
 * This is the shape the UI reads. It stays deliberately close to what a
 * sensor repository will eventually return, so wiring the backend later is
 * a matter of swapping the source of `SILOS` — not editing screens.
 *
 * Three corrections to the previous data model are baked in here:
 *  1. Grain moisture content (% wet basis) is modelled separately from
 *     relative humidity (% RH). They are different quantities with
 *     different safe bands and were previously conflated.
 *  2. Vision defects are stored as affected kernel COUNTS against a sample
 *     size; percentages are derived, never typed in.
 *  3. The health index is computed from the readings rather than asserted,
 *     so "fused from three modalities" is literally true.
 */

// ─── Bands and thresholds ────────────────────────────────────────────

import type { AcousticClassification } from './acoustic';

export type Band = 'ok' | 'caution' | 'critical' | 'idle';

/** Ascending-is-worse limits, plus the floor/ceiling used for scoring. */
export type Limits = {
  floor: number;
  ok: number;
  caution: number;
  hard: number;
};

/**
 * Safe-storage limits for tropical grain storage. Sources these are modelled
 * on: mould growth requires >65% interstitial RH; insect development rate
 * climbs sharply above 27 degrees C; 13% moisture content (wet basis) is the
 * conventional safe ceiling for long-term maize storage.
 *
 * These are the factory baseline. A store can raise or lower its own ceilings
 * from Threshold Config, which is persisted per facility in Firestore.
 */
const DEFAULTS = {
  temperatureC: { floor: 15, ok: 27, caution: 32, hard: 40 },
  relativeHumidity: { floor: 40, ok: 65, caution: 75, hard: 90 },
  moistureContent: { floor: 8, ok: 13, caution: 14.5, hard: 18 },
  damagePercent: { floor: 0, ok: 2, caution: 5, hard: 20 },
} as const satisfies Record<string, Limits>;

export type MetricKey = keyof typeof DEFAULTS;
export type LimitTable = Record<MetricKey, Limits>;

export const METRIC_KEYS = Object.keys(DEFAULTS) as MetricKey[];

const copyLimits = (from: LimitTable): LimitTable => ({
  temperatureC: { ...from.temperatureC },
  relativeHumidity: { ...from.relativeHumidity },
  moistureContent: { ...from.moistureContent },
  damagePercent: { ...from.damagePercent },
});

/** The shipped baseline. Never mutated — it is what a reset returns to. */
export const DEFAULT_LIMITS: LimitTable = copyLimits(DEFAULTS);

/**
 * The limits actually in force.
 *
 * This object is mutated in place by `applyThresholds` when a facility's saved
 * ceilings load, rather than being threaded through every function as an
 * argument. That is deliberate: `bandOf`, `scoreOf` and roughly a dozen screens
 * read `LIMITS[metric].ok` directly — including inside prose — and an argument
 * would fix the band maths while leaving every sentence quoting the old number.
 * Re-rendering is driven by the facility store, which holds the same values in
 * state, so a change to the thresholds re-renders the screens that show them.
 */
export const LIMITS: LimitTable = copyLimits(DEFAULTS);

/**
 * The one number per metric that a store actually edits: its safe ceiling.
 * Floor, caution and hard limits move with it (see `applyThresholds`).
 */
export type ThresholdMap = Record<MetricKey, number>;

export const DEFAULT_THRESHOLDS: ThresholdMap = METRIC_KEYS.reduce(
  (acc, key) => {
    acc[key] = DEFAULT_LIMITS[key].ok;
    return acc;
  },
  {} as ThresholdMap,
);

/**
 * Point the model at a store's own safe ceilings.
 *
 * Only `ok` is user-editable, but the band edges have to stay ordered or
 * `bandOf` starts calling a value below the caution line "critical". So the
 * caution and hard limits shift by the same delta the operator applied to the
 * ceiling, preserving the spacing the scoring curve was designed around.
 * Anything missing or non-numeric falls back to the factory value, so a partial
 * or half-written Firestore document cannot corrupt the model.
 *
 * Returns the values that were actually applied, after clamping.
 */
export function applyThresholds(
  next: Partial<ThresholdMap> | null | undefined,
): ThresholdMap {
  const applied = {} as ThresholdMap;

  for (const key of METRIC_KEYS) {
    const base = DEFAULT_LIMITS[key];
    const raw = next?.[key];
    const ok =
      typeof raw === 'number' && Number.isFinite(raw)
        ? clamp(raw, base.floor, base.hard)
        : base.ok;
    const shift = ok - base.ok;

    LIMITS[key].floor = base.floor;
    LIMITS[key].ok = ok;
    LIMITS[key].caution = base.caution + shift;
    LIMITS[key].hard = base.hard + shift;
    applied[key] = ok;
  }

  return applied;
}

/** The ceilings currently in force, in the shape Threshold Config edits. */
export function currentThresholds(): ThresholdMap {
  return METRIC_KEYS.reduce((acc, key) => {
    acc[key] = LIMITS[key].ok;
    return acc;
  }, {} as ThresholdMap);
}

/** Which band a value falls into for a given metric. */
export function bandOf(value: number, metric: MetricKey): Band {
  const l = LIMITS[metric];
  if (value > l.caution) return 'critical';
  if (value > l.ok) return 'caution';
  return 'ok';
}

/**
 * Map a reading to 0-100, where 100 is ideal. Piecewise-linear so the
 * segments line up with the bands: ok spans 100-80, caution 80-50,
 * critical 50-0. A value pinned at the hard limit scores 0.
 */
export function scoreOf(value: number, metric: MetricKey): number {
  const { floor, ok, caution, hard } = LIMITS[metric];
  const lerp = (v: number, a: number, b: number, hi: number, lo: number) =>
    hi - ((clamp(v, a, b) - a) / (b - a)) * (hi - lo);

  if (value <= ok) return Math.round(lerp(value, floor, ok, 100, 80));
  if (value <= caution) return Math.round(lerp(value, ok, caution, 80, 50));
  return Math.round(lerp(value, caution, hard, 50, 0));
}

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// ─── Readings ────────────────────────────────────────────────────────

export type Trend = 'rising' | 'falling' | 'steady';

export interface EnvironmentReading {
  temperatureC: number;
  relativeHumidity: number;
  /** Grain moisture content, % wet basis. Not the same as RH. */
  moistureContent: number;
  temperatureTrend: Trend;
  humidityTrend: Trend;
  /** Most recent 12 samples, oldest first. Drives the sparklines. */
  temperatureSeries: number[];
  humiditySeries: number[];
  temperatureAvailable: boolean;
  humidityAvailable: boolean;
  moistureAvailable: boolean;
}

export interface AcousticReading {
  scanId: string | null;
  probeId: string | null;
  probabilityInfested: number | null;
  classification: AcousticClassification | null;
  windowProbabilities: number[];
  windowCount: number;
  featureSpace: string;
  sampleRateHz: number;
  measuredSampleRatesHz: number[];
  modelName: string;
  modelVersion: string;
  threshold: number;
  reviewBand: number;
  capturedTemperatureC: number | null;
  capturedHumidityPct: number | null;
  dhtValid: boolean;
  batteryV: number | null;
  minutesAgo: number;
}

export interface VisionReading {
  /** Kernels in the analysed sample. Percentages derive from this. */
  sampleSize: number;
  boreHoles: number;
  discoloration: number;
  fragmentation: number;
  mould: number;
  confidence: number;
  model: string;
  minutesAgo: number;
}

export interface Silo {
  id: string;
  /** Hardware-facing Probe ID shown to the operator. */
  code: string;
  name: string;
  crop: 'Maize' | 'Cowpea' | 'Rice' | 'Not set';
  capacityKg: number;
  storedKg: number;
  nodeId: string;
  nodeOnline: boolean;
  /** False only when a registered probe has never delivered a frame. */
  hasReported?: boolean;
  /** Age of the most recent telemetry frame, in minutes. */
  minutesAgo: number;
  environment: EnvironmentReading;
  acoustic: AcousticReading;
  vision: VisionReading;
}

// ─── Derived vision figures ──────────────────────────────────────────

export interface VisionDefect {
  key: string;
  label: string;
  count: number;
  percent: number;
  band: Band;
}

/**
 * The defect-count fields only. Both live readings and stored scan history
 * satisfy this, so the derivation below works on either without duplication.
 */
export type DefectSample = Pick<
  VisionReading,
  'sampleSize' | 'boreHoles' | 'discoloration' | 'fragmentation' | 'mould'
>;

/** Defect breakdown with percentages derived from the sample size. */
export function visionDefects(v: DefectSample): VisionDefect[] {
  const rows: Array<[string, string, number]> = [
    ['boreHoles', 'Bore holes', v.boreHoles],
    ['discoloration', 'Discoloration', v.discoloration],
    ['fragmentation', 'Fragmentation', v.fragmentation],
    ['mould', 'Mould', v.mould],
  ];
  return rows.map(([key, label, count]) => {
    const percent = v.sampleSize > 0 ? (count / v.sampleSize) * 100 : 0;
    return {
      key,
      label,
      count,
      percent,
      band: bandOf(percent, 'damagePercent'),
    };
  });
}

/** Total share of the sample showing any defect. */
export function totalDamagePercent(v: DefectSample): number {
  const affected = v.boreHoles + v.discoloration + v.fragmentation + v.mould;
  return v.sampleSize > 0 ? (affected / v.sampleSize) * 100 : 0;
}

// ─── Health fusion ───────────────────────────────────────────────────

export interface Subscore {
  key: 'environment' | 'acoustic' | 'vision';
  label: string;
  score: number;
  band: Band;
  /** The reading that limited this subscore, for "why is it 61?" */
  limitedBy: string;
  weight: number;
}

export interface HealthIndex {
  index: number;
  band: Band;
  label: string;
  subscores: Subscore[];
}

export const HEALTH_WEIGHTS = { environment: 0.35, acoustic: 0.3, vision: 0.35 } as const;

/** Probability-to-health mapping aligned exactly with the RF review bands. */
export function acousticScore(probability: number | null): number | null {
  if (probability == null || !Number.isFinite(probability)) return null;
  const value = clamp(probability, 0, 1);
  const lerp = (v: number, a: number, b: number, hi: number, lo: number) =>
    hi - ((v - a) / (b - a)) * (hi - lo);
  if (value < 0.4) return Math.round(lerp(value, 0, 0.4, 100, 80));
  if (value <= 0.7) return Math.round(lerp(value, 0.4, 0.7, 80, 50));
  return Math.round(lerp(value, 0.7, 1, 50, 0));
}

export function acousticBand(reading: AcousticReading): Band {
  if (reading.classification === 'infested') return 'critical';
  if (reading.classification === 'needs_review') return 'caution';
  if (reading.classification === 'clean') return 'ok';
  return 'idle';
}

/**
 * Each modality scores as its own limiting factor (the worst constituent
 * reading governs, after Liebig's law of the minimum), then the index is the
 * weighted mean of the three. A single bad reading therefore cannot be
 * averaged away, which is the behaviour you want from a spoilage warning.
 */
export function healthIndex(silo: Silo): HealthIndex {
  const { environment: e, acoustic: a, vision: v } = silo;

  const envParts: Array<[string, number]> = [];
  if (e.temperatureAvailable)
    envParts.push(['Temperature', scoreOf(e.temperatureC, 'temperatureC')]);
  if (e.humidityAvailable)
    envParts.push([
      'Humidity',
      scoreOf(e.relativeHumidity, 'relativeHumidity'),
    ]);
  if (e.moistureAvailable)
    envParts.push(['Moisture', scoreOf(e.moistureContent, 'moistureContent')]);

  const subscores: Subscore[] = [];
  if (envParts.length) {
    const env = limiting(envParts);
    subscores.push({
      key: 'environment',
      label: 'Environment',
      ...env,
      weight: HEALTH_WEIGHTS.environment,
      band: bandFromScore(env.score),
    });
  }

  const probabilityScore = acousticScore(a.probabilityInfested);
  if (probabilityScore != null) {
    subscores.push({
      key: 'acoustic',
      label: 'Acoustic',
      score: probabilityScore,
      limitedBy: 'Infestation probability',
      weight: HEALTH_WEIGHTS.acoustic,
      band: acousticBand(a),
    });
  }

  if (v.sampleSize > 0) {
    const vis = limiting([
      ['Total damage', scoreOf(totalDamagePercent(v), 'damagePercent')],
      ...visionDefects(v).map(
        d => [d.label, scoreOf(d.percent, 'damagePercent')] as [string, number],
      ),
    ]);
    subscores.push({
      key: 'vision',
      label: 'Vision',
      ...vis,
      weight: HEALTH_WEIGHTS.vision,
      band: bandFromScore(vis.score),
    });
  }

  if (!subscores.length) {
    return { index: 0, band: 'idle', label: 'No data', subscores: [] };
  }

  const index = Math.round(
    subscores.reduce((sum, s) => sum + s.score * s.weight, 0) /
      subscores.reduce((sum, s) => sum + s.weight, 0),
  );

  return {
    index,
    band: bandFromScore(index),
    label: healthLabel(index),
    subscores,
  };
}

function limiting(parts: Array<[string, number]>) {
  const worst = parts.reduce((acc, p) => (p[1] < acc[1] ? p : acc), parts[0]);
  return { score: worst[1], limitedBy: worst[0] };
}

export function bandFromScore(score: number): Band {
  if (score < 50) return 'critical';
  if (score < 80) return 'caution';
  return 'ok';
}

export function healthLabel(score: number): string {
  if (score < 50) return 'At risk';
  if (score < 80) return 'Watch';
  return 'Sound';
}

// ─── Alerts, derived rather than hardcoded ───────────────────────────

export interface Alert {
  id: string;
  band: Exclude<Band, 'ok' | 'idle'>;
  modality: 'environment' | 'acoustic' | 'vision' | 'node';
  title: string;
  detail: string;
  action: string;
}

function isAlertBand(band: Band): band is Alert['band'] {
  return band === 'caution' || band === 'critical';
}

/**
 * Every alert here is produced by comparing a reading against LIMITS, so a
 * silo reading "Sound" cannot display a warning — which the previous
 * hardcoded alert card did.
 */
export function deriveAlerts(silo: Silo): Alert[] {
  const out: Alert[] = [];
  const { environment: e, acoustic: a, vision: v } = silo;

  if (!silo.nodeOnline) {
    const waiting = silo.hasReported === false;
    out.push({
      id: 'node-offline',
      band: waiting ? 'caution' : 'critical',
      modality: 'node',
      title: waiting ? 'Awaiting first probe reading' : 'Probe offline',
      detail: waiting
        ? `${silo.nodeId} is registered but has not delivered a reading yet.`
        : `${silo.nodeId} has not reported for ${silo.minutesAgo} minutes. Readings below are the last known values.`,
      action:
        'Check probe power and Wi-Fi range, then confirm its gateway connection.',
    });
  }

  const rh: Band = e.humidityAvailable
    ? bandOf(e.relativeHumidity, 'relativeHumidity')
    : 'idle';
  if (isAlertBand(rh)) {
    out.push({
      id: 'rh',
      band: rh,
      modality: 'environment',
      title:
        rh === 'critical'
          ? 'Humidity above safe ceiling'
          : 'Humidity approaching limit',
      detail: `Interstitial RH is ${e.relativeHumidity}%, against a ${LIMITS.relativeHumidity.ok}% safe ceiling. Mould becomes viable above that point.`,
      action:
        'Increase aeration and confirm exhaust fans are running. Re-check in two hours.',
    });
  }

  const mc: Band = e.moistureAvailable
    ? bandOf(e.moistureContent, 'moistureContent')
    : 'idle';
  if (isAlertBand(mc)) {
    out.push({
      id: 'moisture',
      band: mc,
      modality: 'environment',
      title:
        mc === 'critical'
          ? 'Grain too wet to store'
          : 'Moisture content elevated',
      detail: `Moisture content is ${e.moistureContent.toFixed(
        1,
      )}% wet basis, against a ${
        LIMITS.moistureContent.ok
      }% safe ceiling for long-term storage.`,
      action:
        'Move the affected lot to the drying floor before it is sealed for storage.',
    });
  }

  const temp: Band = e.temperatureAvailable
    ? bandOf(e.temperatureC, 'temperatureC')
    : 'idle';
  if (isAlertBand(temp)) {
    out.push({
      id: 'temperature',
      band: temp,
      modality: 'environment',
      title:
        temp === 'critical'
          ? 'Temperature above safe ceiling'
          : 'Temperature elevated',
      detail: `${e.temperatureC}°C against a ${LIMITS.temperatureC.ok}°C ceiling. Insect development roughly doubles for every 5°C above it.`,
      action:
        'Run night aeration while ambient air is cooler than the grain mass.',
    });
  }

  const act = acousticBand(a);
  if (isAlertBand(act)) {
    out.push({
      id: 'acoustic',
      band: act,
      modality: 'acoustic',
      title:
        act === 'critical'
          ? 'Acoustic infestation detected'
          : 'Acoustic result needs review',
      detail: `${Math.round(
        (a.probabilityInfested ?? 0) * 100,
      )}% infestation probability from ${a.windowCount} probe windows.`,
      action:
        act === 'critical'
          ? 'Isolate the lot and schedule targeted fumigation.'
          : 'Inspect the lot and wait for a confirming probe event before treating.',
    });
  }

  const dmg = totalDamagePercent(v);
  const dmgBand: Band =
    v.sampleSize > 0 ? bandOf(dmg, 'damagePercent') : 'idle';
  if (isAlertBand(dmgBand)) {
    const worst = visionDefects(v).reduce((x, y) =>
      y.percent > x.percent ? y : x,
    );
    out.push({
      id: 'vision',
      band: dmgBand,
      modality: 'vision',
      title:
        dmgBand === 'critical'
          ? 'Surface damage above tolerance'
          : 'Surface damage rising',
      detail: `${dmg.toFixed(1)}% of the ${
        v.sampleSize
      }-kernel sample shows defects, led by ${worst.label.toLowerCase()} at ${worst.percent.toFixed(
        1,
      )}%.`,
      action:
        'Re-sample from a second draw point to confirm, then grade the lot down if it holds.',
    });
  }

  const order = { critical: 0, caution: 1 } as const;
  return out.sort((x, y) => order[x.band] - order[y.band]);
}

// ─── Presentation helpers for bands ──────────────────────────────────

export const BAND_LABEL: Record<Band, string> = {
  ok: 'Normal',
  caution: 'Caution',
  critical: 'Critical',
  idle: 'No data',
};

// ─── Equilibrium moisture content ────────────────────────────────────

/**
 * Modified Henderson coefficients, T in degrees C, moisture in % dry basis.
 * Maize and rough rice use the published sets; cowpea has no widely published
 * set, so it borrows soybean as the closest large-seeded legume analogue —
 * treat that curve as indicative rather than exact.
 */
const HENDERSON = {
  Maize: { k: 8.6541e-5, n: 1.8634, c: 49.81 },
  Rice: { k: 1.9187e-5, n: 2.4451, c: 51.161 },
  Cowpea: { k: 30.5327e-5, n: 1.2164, c: 134.58 },
} as const;

/**
 * Moisture content the grain will drift toward if held at this temperature and
 * humidity, as % wet basis.
 *
 * This is the number that turns the dashboard from a readout into a warning:
 * grain can sit inside its safe moisture band today and still be heading out of
 * it, because the headspace air it is equilibrating with is too humid.
 */
export function equilibriumMoisture(
  tempC: number,
  rhPercent: number,
  crop: keyof typeof HENDERSON,
): number {
  const { k, n, c } = HENDERSON[crop];
  const rh = clamp(rhPercent, 1, 99) / 100;
  const dryBasis = Math.pow(-Math.log(1 - rh) / (k * (tempC + c)), 1 / n);
  return (dryBasis / (100 + dryBasis)) * 100;
}

// ─── Fleet roll-up ───────────────────────────────────────────────────

export interface FleetSummary {
  siloCount: number;
  storedKg: number;
  capacityKg: number;
  /** Silos with at least one derived alert. */
  needAttention: number;
  criticalCount: number;
  offlineCount: number;
  alertCount: number;
  /** Worst index across the fleet, for the header status mark. */
  worstBand: Band;
  freshestMinutes: number;
}

export function fleetSummary(silos: Silo[]): FleetSummary {
  let needAttention = 0;
  let criticalCount = 0;
  let alertCount = 0;
  let worst = 100;
  let hasHealthEvidence = false;

  for (const silo of silos) {
    const alerts = deriveAlerts(silo);
    alertCount += alerts.length;
    if (alerts.length > 0) needAttention += 1;
    if (alerts.some(a => a.band === 'critical')) criticalCount += 1;
    const health = healthIndex(silo);
    if (health.subscores.length) {
      hasHealthEvidence = true;
      worst = Math.min(worst, health.index);
    }
  }

  const reported = silos.filter(silo => silo.hasReported !== false);
  return {
    siloCount: silos.length,
    storedKg: silos.reduce((s, x) => s + x.storedKg, 0),
    capacityKg: silos.reduce((s, x) => s + x.capacityKg, 0),
    needAttention,
    criticalCount,
    offlineCount: silos.filter(s => !s.nodeOnline).length,
    alertCount,
    worstBand: hasHealthEvidence ? bandFromScore(worst) : 'idle',
    // Math.min of nothing is Infinity, which would render as a nonsense age.
    freshestMinutes: reported.length
      ? Math.min(...reported.map(s => s.minutesAgo))
      : 0,
  };
}

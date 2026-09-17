/**
 * Firestore documents to and from the domain model in src/core/monitoring.ts.
 *
 * Two rules this file exists to enforce.
 *
 * Freshness is never stored. The model carries `minutesAgo` and `nodeOnline`,
 * but Firestore holds `lastFrameAt` — an absolute instant. Writing "3 minutes
 * ago" into a database means the record is wrong the moment after it is saved,
 * and a cached document would claim a dead node is live. The age is derived here
 * instead, once per snapshot against a single clock reading, so every silo in one
 * update is measured from the same instant and the numbers stay stable between
 * renders of the same data.
 *
 * Nothing trusts the document. Every field goes through a coercer with a
 * fallback, so a half-written record, a manual edit in the Firebase console or a
 * schema change mid-flight degrades one reading rather than throwing inside a
 * render.
 */

import { Timestamp } from '@react-native-firebase/firestore';

import type { AcousticClassification } from '../core/acoustic';
import type {
  AcousticReading,
  EnvironmentReading,
  Silo,
  Trend,
  VisionReading,
} from '../core/monitoring';
import type { AcousticEvent, Facility, VisionScan } from '../core/domain';

/** A node that has not reported for this long is treated as offline. */
export const STALE_AFTER_MINUTES = 30;

const CROPS: Silo['crop'][] = ['Maize', 'Cowpea', 'Rice', 'Not set'];
const TRENDS: Trend[] = ['rising', 'falling', 'steady'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ─── Coercers ────────────────────────────────────────────────────────

type Doc = Record<string, unknown>;

const asDoc = (value: unknown): Doc =>
  value && typeof value === 'object' ? (value as Doc) : {};

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const nullableStr = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const optionalNum = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const numArray = (value: unknown, fallback: number[]): number[] =>
  Array.isArray(value) && value.length > 0
    ? value.map(v => num(v, 0))
    : fallback;

const oneOf = <T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T,
): T =>
  typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;

/**
 * Milliseconds out of whatever the field holds. A Timestamp from the server, a
 * plain {seconds} pair out of the offline cache, a raw epoch number, or null
 * while a serverTimestamp() write is still pending.
 */
export function millisOf(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const candidate = value as { toMillis?: () => number; seconds?: unknown };
  if (typeof candidate.toMillis === 'function') return candidate.toMillis();
  if (typeof candidate.seconds === 'number') return candidate.seconds * 1000;
  return null;
}

/**
 * Age in whole minutes, floored at zero. A missing or pending timestamp reads as
 * `fallback` rather than zero, so an unwritten field cannot masquerade as a
 * frame that just arrived.
 */
export function minutesSince(
  value: unknown,
  now: number,
  fallback = STALE_AFTER_MINUTES + 1,
): number {
  const millis = millisOf(value);
  if (millis == null) return fallback;
  return Math.max(0, Math.round((now - millis) / 60000));
}

/** Timestamp for an instant `minutesAgo` before `now`. Used when seeding. */
export const timestampMinutesAgo = (
  now: number,
  minutesAgo: number,
): Timestamp => Timestamp.fromMillis(now - minutesAgo * 60000);

/** 24-hour clock, hand-rolled: Hermes ships without ICU, so toLocaleTimeString lies. */
export function clockOf(millis: number): string {
  const d = new Date(millis);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "16 Aug", same reason as clockOf. */
export function dayOf(millis: number): string {
  const d = new Date(millis);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ─── Facility ────────────────────────────────────────────────────────

export function facilityFromDoc(data: Doc | undefined): Facility {
  const d = asDoc(data);
  return {
    name: str(d.name, 'Unnamed store'),
    operator: str(d.operator, '—'),
    region: str(d.region, '—'),
    gatewayId: str(d.gatewayId, '—'),
    firmware: str(d.firmware, '—'),
  };
}

// ─── Silo ────────────────────────────────────────────────────────────

function environmentFromDoc(
  data: unknown,
  hasFrame: boolean,
): EnvironmentReading {
  const d = asDoc(data);
  // Older silo documents predate this flag, so only an explicit false marks
  // the latest DHT sample invalid.
  const dhtValid = d.dhtValid !== false;
  const temperatureValue = optionalNum(d.temperatureC);
  // The phone-written current state uses `relativeHumidity`; the deployed
  // gateway's direct state document uses `humidityPct`. They describe the same
  // DHT channel, so accept both without rewriting or inventing a reading.
  const humidityValue = optionalNum(d.relativeHumidity ?? d.humidityPct);
  const moistureValue = optionalNum(d.moistureContent);
  const temperatureC = temperatureValue ?? 0;
  const relativeHumidity = humidityValue ?? 0;
  return {
    temperatureC,
    relativeHumidity,
    moistureContent: moistureValue ?? 0,
    temperatureTrend: oneOf(d.temperatureTrend, TRENDS, 'steady'),
    humidityTrend: oneOf(d.humidityTrend, TRENDS, 'steady'),
    // A one-point series still renders — the sparkline draws a flat line rather
    // than dividing by a zero-length range.
    temperatureSeries: numArray(
      d.temperatureSeries,
      temperatureValue == null ? [] : [temperatureC],
    ),
    humiditySeries: numArray(
      d.humiditySeries,
      humidityValue == null ? [] : [relativeHumidity],
    ),
    temperatureAvailable: hasFrame && dhtValid && temperatureValue != null,
    humidityAvailable: hasFrame && dhtValid && humidityValue != null,
    moistureAvailable: hasFrame && moistureValue != null && moistureValue > 0,
  };
}

function acousticFromDoc(data: unknown, now: number): AcousticReading {
  const d = asDoc(data);
  const model = asDoc(d.model);
  const environment = asDoc(d.environment);
  const device = asDoc(d.device);
  const probabilityInfested = optionalNum(d.probabilityInfested);
  const allowed: AcousticClassification[] = [
    'clean',
    'needs_review',
    'infested',
  ];
  return {
    scanId: nullableStr(d.scanId),
    probeId: nullableStr(d.probeId),
    probabilityInfested,
    classification:
      probabilityInfested == null
        ? null
        : oneOf(d.classification, allowed, 'needs_review'),
    windowProbabilities: numArray(d.windowProbabilities, []),
    windowCount: num(d.windowCount, 0),
    featureSpace: str(d.featureSpace, 'unknown'),
    sampleRateHz: num(d.sampleRateHz, 0),
    measuredSampleRatesHz: numArray(d.measuredSampleRatesHz, []),
    modelName: str(
      model.name,
      typeof d.model === 'string' ? d.model : 'unavailable',
    ),
    modelVersion: str(model.version, 'unavailable'),
    threshold: num(model.threshold, 0.55),
    reviewBand: num(model.reviewBand, 0.15),
    capturedTemperatureC: optionalNum(environment.temperatureC),
    capturedHumidityPct: optionalNum(environment.humidityPct),
    dhtValid: environment.dhtValid === true,
    batteryV: optionalNum(device.batteryV),
    minutesAgo: minutesSince(d.recordedAt, now),
  };
}

function visionFromDoc(data: unknown, now: number): VisionReading {
  const d = asDoc(data);
  return {
    sampleSize: num(d.sampleSize, 0),
    boreHoles: num(d.boreHoles, 0),
    discoloration: num(d.discoloration, 0),
    fragmentation: num(d.fragmentation, 0),
    mould: num(d.mould, 0),
    confidence: num(d.confidence, 0),
    model: str(d.model, 'unavailable'),
    minutesAgo: minutesSince(d.recordedAt, now),
  };
}

export function siloFromDoc(
  id: string,
  data: Doc | undefined,
  now: number,
): Silo {
  const d = asDoc(data);
  const environment = asDoc(d.environment);
  const acoustic = asDoc(d.acoustic);
  // The gateway writes lastSeenAt/capturedAt before the mobile inference
  // processor promotes an inbox event and adds lastFrameAt. Use the freshest
  // real timestamp shape available so a live probe is never shown as empty.
  const reportedAt =
    d.lastFrameAt ?? d.lastSeenAt ?? environment.capturedAt ?? acoustic.recordedAt;
  const hasReported = millisOf(reportedAt) != null;
  const minutesAgo = minutesSince(reportedAt, now);
  const probeId = str(d.probeId, str(acoustic.probeId, id));
  return {
    id,
    code: str(d.code, probeId),
    name: str(d.name, `Probe ${probeId}`),
    crop: oneOf(d.crop, CROPS, 'Not set'),
    capacityKg: num(d.capacityKg, 0),
    storedKg: num(d.storedKg, 0),
    nodeId: str(d.nodeId, probeId),
    // Derived, never stored: a document that says "online" is only ever a claim
    // about the moment it was written.
    nodeOnline: minutesAgo <= STALE_AFTER_MINUTES,
    hasReported,
    minutesAgo,
    environment: environmentFromDoc(
      d.environment,
      hasReported,
    ),
    acoustic: acousticFromDoc(d.acoustic, now),
    vision: visionFromDoc(d.vision, now),
  };
}

/**
 * Silo to document. `minutesAgo` and `nodeOnline` are dropped on the way in and
 * become absolute instants, which is the whole point of the mapper.
 */
export function siloToDoc(silo: Silo, now: number, order: number): Doc {
  return {
    code: silo.code,
    name: silo.name,
    crop: silo.crop,
    capacityKg: silo.capacityKg,
    storedKg: silo.storedKg,
    nodeId: silo.nodeId,
    order,
    lastFrameAt: timestampMinutesAgo(now, silo.minutesAgo),
    environment: {
      temperatureC: silo.environment.temperatureC,
      relativeHumidity: silo.environment.relativeHumidity,
      moistureContent: silo.environment.moistureContent,
      temperatureTrend: silo.environment.temperatureTrend,
      humidityTrend: silo.environment.humidityTrend,
      temperatureSeries: silo.environment.temperatureSeries,
      humiditySeries: silo.environment.humiditySeries,
    },
    acoustic: {
      scanId: silo.acoustic.scanId,
      probeId: silo.acoustic.probeId,
      probabilityInfested: silo.acoustic.probabilityInfested,
      classification: silo.acoustic.classification,
      windowProbabilities: silo.acoustic.windowProbabilities,
      windowCount: silo.acoustic.windowCount,
      featureSpace: silo.acoustic.featureSpace,
      sampleRateHz: silo.acoustic.sampleRateHz,
      measuredSampleRatesHz: silo.acoustic.measuredSampleRatesHz,
      environment: {
        temperatureC: silo.acoustic.capturedTemperatureC,
        humidityPct: silo.acoustic.capturedHumidityPct,
        dhtValid: silo.acoustic.dhtValid,
      },
      device: { batteryV: silo.acoustic.batteryV },
      model: {
        name: silo.acoustic.modelName,
        version: silo.acoustic.modelVersion,
        threshold: silo.acoustic.threshold,
        reviewBand: silo.acoustic.reviewBand,
      },
      recordedAt: timestampMinutesAgo(now, silo.acoustic.minutesAgo),
    },
    vision: {
      sampleSize: silo.vision.sampleSize,
      boreHoles: silo.vision.boreHoles,
      discoloration: silo.vision.discoloration,
      fragmentation: silo.vision.fragmentation,
      mould: silo.vision.mould,
      confidence: silo.vision.confidence,
      model: silo.vision.model,
      recordedAt: timestampMinutesAgo(now, silo.vision.minutesAgo),
    },
  };
}

// ─── Acoustic events ─────────────────────────────────────────────────

export function acousticEventFromDoc(
  id: string,
  data: Doc | undefined,
  now: number,
): AcousticEvent {
  const d = asDoc(data);
  const environment = asDoc(d.environment);
  const device = asDoc(d.device);
  const model = asDoc(d.model);
  const recordedAt = d.capturedAt ?? d.recordedAt;
  const recordedMillis = millisOf(recordedAt) ?? now;
  const probabilityInfested = optionalNum(d.probabilityInfested);
  const allowed: AcousticClassification[] = [
    'clean',
    'needs_review',
    'infested',
  ];
  return {
    id,
    siloId: str(d.siloId, ''),
    clock: clockOf(recordedMillis),
    minutesAgo: minutesSince(recordedAt, now, 0),
    scanId: str(d.scanId, id),
    probeId: str(d.probeId, 'unavailable'),
    probabilityInfested,
    classification:
      probabilityInfested == null
        ? null
        : oneOf(d.classification, allowed, 'needs_review'),
    windowProbabilities: numArray(d.windowProbabilities, []),
    windowCount: num(d.windowCount, 0),
    temperatureC: optionalNum(environment.temperatureC),
    humidityPct: optionalNum(environment.humidityPct),
    dhtValid: environment.dhtValid === true,
    batteryV: optionalNum(device.batteryV),
    modelName: str(model.name, 'unavailable'),
    modelVersion: str(model.version, 'unavailable'),
  };
}

export function acousticEventToDoc(event: AcousticEvent, now: number): Doc {
  return {
    scanId: event.scanId,
    probeId: event.probeId,
    siloId: event.siloId,
    recordedAt: timestampMinutesAgo(now, event.minutesAgo),
    capturedAt: timestampMinutesAgo(now, event.minutesAgo),
    probabilityInfested: event.probabilityInfested,
    classification: event.classification,
    windowProbabilities: event.windowProbabilities,
    windowCount: event.windowCount,
    environment: {
      temperatureC: event.temperatureC,
      humidityPct: event.humidityPct,
      dhtValid: event.dhtValid,
    },
    device: { batteryV: event.batteryV },
    model: {
      name: event.modelName,
      version: event.modelVersion,
      threshold: 0.55,
      reviewBand: 0.15,
    },
  };
}

// ─── Vision scans ────────────────────────────────────────────────────

export function visionScanFromDoc(
  id: string,
  data: Doc | undefined,
  now: number,
): VisionScan {
  const d = asDoc(data);
  const recordedMillis = millisOf(d.recordedAt) ?? now;
  return {
    id,
    siloId: str(d.siloId, ''),
    label: str(d.label, 'Scan'),
    day: dayOf(recordedMillis),
    minutesAgo: minutesSince(d.recordedAt, now, 0),
    sampleSize: num(d.sampleSize, 0),
    boreHoles: num(d.boreHoles, 0),
    discoloration: num(d.discoloration, 0),
    fragmentation: num(d.fragmentation, 0),
    mould: num(d.mould, 0),
    confidence: num(d.confidence, 0),
  };
}

export function visionScanToDoc(scan: VisionScan, now: number): Doc {
  return {
    siloId: scan.siloId,
    recordedAt: timestampMinutesAgo(now, scan.minutesAgo),
    label: scan.label,
    sampleSize: scan.sampleSize,
    boreHoles: scan.boreHoles,
    discoloration: scan.discoloration,
    fragmentation: scan.fragmentation,
    mould: scan.mould,
    confidence: scan.confidence,
  };
}

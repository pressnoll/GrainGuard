/**
 * The detection log and the scan history.
 *
 * Saving a scan does two things in one batch: it appends to the history, and it
 * replaces the silo's current reading. A scan *is* the newest measurement, so if
 * only the log were written the dashboard would keep showing an older figure than
 * the report the operator is looking at.
 *
 * Both feeds are read newest-first with a hard cap. Filtering by silo happens in
 * memory, which keeps every query on a single-field index — no composite indexes
 * to deploy, and no screen breaking because an index is still building.
 */

import {
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from '@react-native-firebase/firestore';

import type { AcousticEvent, VisionScan } from '../core/domain';

import { db } from './firebase';
import { acousticEventFromDoc, visionScanFromDoc } from './mappers';
import {
  acousticEventsCollection,
  siloDoc,
  visionScansCollection,
} from './paths';

/** Enough history for the charts and the Insights table without unbounded reads. */
export const HISTORY_LIMIT = 50;

function isLegacyDemoAcoustic(data: Record<string, unknown>): boolean {
  const model = data.model;
  return Boolean(
    model &&
      typeof model === 'object' &&
      (model as Record<string, unknown>).version === 'demo',
  );
}

const LEGACY_DEMO_VISION_IDS = new Set(['vs-1', 'vs-2', 'vs-3', 'vs-4']);

export function subscribeAcousticEvents(
  fid: string,
  next: (events: AcousticEvent[]) => void,
  onError?: (message: string) => void,
): () => void {
  return onSnapshot(
    query(
      acousticEventsCollection(fid),
      orderBy('recordedAt', 'desc'),
      limit(HISTORY_LIMIT),
    ),
    snapshot => {
      const now = Date.now();
      next(
        snapshot.docs
          .filter(d => !isLegacyDemoAcoustic(d.data()))
          .map(d => acousticEventFromDoc(d.id, d.data(), now)),
      );
    },
    error => onError?.(error.message),
  );
}

export function subscribeVisionScans(
  fid: string,
  next: (scans: VisionScan[]) => void,
  onError?: (message: string) => void,
): () => void {
  return onSnapshot(
    query(
      visionScansCollection(fid),
      orderBy('recordedAt', 'desc'),
      limit(HISTORY_LIMIT),
    ),
    snapshot => {
      const now = Date.now();
      next(
        snapshot.docs
          .filter(d => !LEGACY_DEMO_VISION_IDS.has(d.id))
          .map(d => visionScanFromDoc(d.id, d.data(), now)),
      );
    },
    error => onError?.(error.message),
  );
}

export type VisionScanInput = {
  siloId: string;
  label: string;
  sampleSize: number;
  boreHoles: number;
  discoloration: number;
  fragmentation: number;
  mould: number;
  confidence: number;
  model: string;
  /** Extra model output retained with the history record for later audit. */
  crop?: string;
  route?: 'direct' | 'segmented';
  prediction?: string;
  advice?: string;
  classCounts?: Record<string, number>;
  /** The verdict landed below the model's trust floor and was badged on screen. */
  lowTrust?: boolean;
  /** Generic-head second opinion: sound / damaged / impurity. */
  crossCheck?: string;
  /** Beans: share of heap views showing weevil damage, and the level it maps to. */
  extentPercent?: number;
  severity?: string;
};

/** Appends a scan and promotes it to the silo's current vision reading. */
export async function recordVisionScan(
  fid: string,
  scan: VisionScanInput,
): Promise<string> {
  const ref = doc(visionScansCollection(fid));
  const recordedAt = Timestamp.now();
  const batch = writeBatch(db());

  batch.set(ref, {
    siloId: scan.siloId,
    label: scan.label,
    recordedAt,
    sampleSize: scan.sampleSize,
    boreHoles: scan.boreHoles,
    discoloration: scan.discoloration,
    fragmentation: scan.fragmentation,
    mould: scan.mould,
    confidence: scan.confidence,
    crop: scan.crop ?? null,
    route: scan.route ?? null,
    prediction: scan.prediction ?? null,
    advice: scan.advice ?? null,
    classCounts: scan.classCounts ?? {},
    lowTrust: scan.lowTrust ?? false,
    crossCheck: scan.crossCheck ?? null,
    extentPercent: scan.extentPercent ?? null,
    severity: scan.severity ?? null,
  });

  batch.update(siloDoc(fid, scan.siloId), {
    vision: {
      sampleSize: scan.sampleSize,
      boreHoles: scan.boreHoles,
      discoloration: scan.discoloration,
      fragmentation: scan.fragmentation,
      mould: scan.mould,
      confidence: scan.confidence,
      model: scan.model,
      recordedAt,
    },
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return ref.id;
}

/**
 * Environment frame from the gateway. The ESP32 nodes will eventually write these
 * directly; until then it is here so the app has one place that knows how a frame
 * lands, and `lastFrameAt` is the only thing that decides whether a node reads as
 * online.
 */
export async function recordEnvironmentFrame(
  fid: string,
  siloId: string,
  reading: {
    temperatureC: number;
    relativeHumidity: number;
    moistureContent: number;
    temperatureSeries: number[];
    humiditySeries: number[];
    temperatureTrend: 'rising' | 'falling' | 'steady';
    humidityTrend: 'rising' | 'falling' | 'steady';
  },
): Promise<void> {
  await updateDoc(siloDoc(fid, siloId), {
    environment: reading,
    lastFrameAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

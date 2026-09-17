import {
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/firestore';

import type { Trend } from '../core/monitoring';
import {
  ACOUSTIC_FEATURE_COUNT,
  ACOUSTIC_WINDOW_COUNT,
  inferAcousticEvent,
} from './acousticInferenceService';
import { db } from './firebase';
import { millisOf } from './mappers';
import { acousticEventDoc, acousticInboxCollection, siloDoc } from './paths';

type Doc = Record<string, unknown>;

export interface AcousticInboxEvent {
  scanId: string;
  probeId: string;
  siloId: string;
  protocolVersion: 1;
  featureSchema: 1;
  featureSpace: 'raw';
  sampleRateHz: 24000;
  windowSeconds: 1;
  windowCount: 5;
  sequence: number;
  firmware: string;
  environment: {
    temperatureC: number;
    humidityPct: number;
    dhtValid: boolean;
  };
  device: {
    batteryV: number;
  };
  windows: Array<{
    index: number;
    measuredSampleRateHz: number;
    features: number[];
  }>;
  receivedAt: unknown;
}

export interface AcousticProcessorStatus {
  pending: number;
  activeScanId: string | null;
  lastProcessedScanId: string | null;
  error: string | null;
}

export type AcousticProcessorCallbacks = {
  onStatus?: (status: AcousticProcessorStatus) => void;
};

const RETRY_DELAY_MS = 30_000;
const processingScanIds = new Set<string>();

class AcousticContractError extends Error {}

function asDoc(value: unknown): Doc {
  return value && typeof value === 'object' ? (value as Doc) : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AcousticContractError(
      `Acoustic inbox field ${field} must be a non-empty string.`,
    );
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AcousticContractError(
      `Acoustic inbox field ${field} must be finite.`,
    );
  }
  return value;
}

function exactNumber(value: unknown, expected: number, field: string): number {
  const number = requiredNumber(value, field);
  if (number !== expected) {
    throw new AcousticContractError(
      `Acoustic inbox field ${field} must be ${expected}; received ${number}.`,
    );
  }
  return number;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AcousticContractError(
      `Acoustic inbox field ${field} must be boolean.`,
    );
  }
  return value;
}

export function acousticInboxEventFromDoc(
  documentId: string,
  value: unknown,
): AcousticInboxEvent {
  const data = asDoc(value);
  const environment = asDoc(data.environment);
  const device = asDoc(data.device);
  const scanId = requiredString(data.scanId, 'scanId');
  if (scanId !== documentId) {
    throw new AcousticContractError(
      'Acoustic inbox scanId does not match its document ID.',
    );
  }

  exactNumber(data.protocolVersion, 1, 'protocolVersion');
  exactNumber(data.featureSchema, 1, 'featureSchema');
  if (data.featureSpace !== 'raw') {
    throw new AcousticContractError('Acoustic inbox featureSpace must be raw.');
  }
  exactNumber(data.sampleRateHz, 24000, 'sampleRateHz');
  exactNumber(data.windowSeconds, 1, 'windowSeconds');
  exactNumber(data.windowCount, ACOUSTIC_WINDOW_COUNT, 'windowCount');

  if (
    !Array.isArray(data.windows) ||
    data.windows.length !== ACOUSTIC_WINDOW_COUNT
  ) {
    throw new AcousticContractError(
      `Acoustic inbox event must contain ${ACOUSTIC_WINDOW_COUNT} windows.`,
    );
  }

  const windows = data.windows.map((windowValue, position) => {
    const window = asDoc(windowValue);
    exactNumber(window.index, position, `windows[${position}].index`);
    const measuredSampleRateHz = requiredNumber(
      window.measured_sample_rate_hz,
      `windows[${position}].measured_sample_rate_hz`,
    );
    if (measuredSampleRateHz <= 0) {
      throw new AcousticContractError(
        `Acoustic inbox field windows[${position}].measured_sample_rate_hz must be positive.`,
      );
    }
    if (
      !Array.isArray(window.features) ||
      window.features.length !== ACOUSTIC_FEATURE_COUNT
    ) {
      throw new AcousticContractError(
        `Acoustic window ${position} must contain ${ACOUSTIC_FEATURE_COUNT} features.`,
      );
    }
    const features = window.features.map((feature, featureIndex) =>
      requiredNumber(feature, `windows[${position}].features[${featureIndex}]`),
    );
    return { index: position, measuredSampleRateHz, features };
  });

  if (millisOf(data.receivedAt) == null) {
    throw new AcousticContractError(
      'Acoustic inbox receivedAt must be a valid timestamp.',
    );
  }

  const sequence = requiredNumber(data.sequence, 'sequence');
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new AcousticContractError(
      'Acoustic inbox field sequence must be a non-negative integer.',
    );
  }

  return {
    scanId,
    probeId: requiredString(data.probeId, 'probeId'),
    siloId: requiredString(data.siloId, 'siloId'),
    protocolVersion: 1,
    featureSchema: 1,
    featureSpace: 'raw',
    sampleRateHz: 24000,
    windowSeconds: 1,
    windowCount: 5,
    sequence,
    firmware: requiredString(data.firmware, 'firmware'),
    environment: {
      temperatureC: requiredNumber(
        environment.temperatureC,
        'environment.temperatureC',
      ),
      humidityPct: requiredNumber(
        environment.humidityPct,
        'environment.humidityPct',
      ),
      dhtValid: requiredBoolean(environment.dhtValid, 'environment.dhtValid'),
    },
    device: {
      batteryV: requiredNumber(device.batteryV, 'device.batteryV'),
    },
    windows,
    receivedAt: data.receivedAt,
  };
}

function finiteSeries(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isFinite(item),
      )
    : [];
}

function appendSample(value: unknown, sample: number): number[] {
  return [...finiteSeries(value), sample].slice(-12);
}

function trendOf(series: number[], tolerance: number): Trend {
  if (series.length < 2) return 'steady';
  const span = Math.min(3, Math.floor(series.length / 2));
  const previous = series.slice(-span * 2, -span);
  const recent = series.slice(-span);
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const change = average(recent) - average(previous);
  if (change > tolerance) return 'rising';
  if (change < -tolerance) return 'falling';
  return 'steady';
}

async function processEvent(
  fid: string,
  documentId: string,
  raw: unknown,
): Promise<void> {
  const event = acousticInboxEventFromDoc(documentId, raw);
  const historyRef = acousticEventDoc(fid, event.scanId);

  // A cheap preflight avoids loading the model for inbox records another phone
  // has already classified. The transaction below remains authoritative.
  if ((await getDoc(historyRef)).exists()) return;

  const result = await inferAcousticEvent(
    event.windows.map(window => window.features),
  );
  const currentSiloRef = siloDoc(fid, event.siloId);

  await runTransaction(db(), async transaction => {
    const historySnapshot = await transaction.get(historyRef);
    if (historySnapshot.exists()) return;

    const siloSnapshot = await transaction.get(currentSiloRef);
    if (!siloSnapshot.exists()) {
      throw new Error(`The mapped silo ${event.siloId} does not exist.`);
    }

    const silo = asDoc(siloSnapshot.data());
    const existingEnvironment = asDoc(silo.environment);
    const existingAcoustic = asDoc(silo.acoustic);
    const acoustic = {
      scanId: event.scanId,
      probeId: event.probeId,
      probabilityInfested: result.probabilityInfested,
      classification: result.classification,
      windowProbabilities: result.windowProbabilities,
      windowCount: event.windowCount,
      featureSchema: event.featureSchema,
      featureSpace: event.featureSpace,
      sampleRateHz: event.sampleRateHz,
      measuredSampleRatesHz: event.windows.map(
        window => window.measuredSampleRateHz,
      ),
      environment: event.environment,
      device: event.device,
      model: {
        name: result.modelName,
        version: result.modelVersion,
        threshold: result.threshold,
        reviewBand: result.reviewBand,
      },
      recordedAt: event.receivedAt,
    };

    transaction.set(historyRef, {
      ...acoustic,
      siloId: event.siloId,
      sequence: event.sequence,
      firmware: event.firmware,
      capturedAt: event.receivedAt,
      classifiedAt: serverTimestamp(),
    });

    // Every valid inbox record belongs in immutable history, but a backlog is
    // processed newest-first. Never let a subsequently processed older record
    // replace the current dashboard result.
    const currentAcousticAt = millisOf(existingAcoustic.recordedAt);
    const incomingAt = millisOf(event.receivedAt);
    if (
      currentAcousticAt != null &&
      incomingAt != null &&
      incomingAt < currentAcousticAt
    ) {
      return;
    }

    const update: Doc = {
      acoustic,
      lastFrameAt: event.receivedAt,
      updatedAt: serverTimestamp(),
    };

    if (event.environment.dhtValid) {
      const temperatureSeries = appendSample(
        existingEnvironment.temperatureSeries,
        event.environment.temperatureC,
      );
      const humiditySeries = appendSample(
        existingEnvironment.humiditySeries,
        event.environment.humidityPct,
      );
      update.environment = {
        ...existingEnvironment,
        temperatureC: event.environment.temperatureC,
        relativeHumidity: event.environment.humidityPct,
        temperatureSeries,
        humiditySeries,
        temperatureTrend: trendOf(temperatureSeries, 0.3),
        humidityTrend: trendOf(humiditySeries, 1),
        dhtValid: true,
        recordedAt: event.receivedAt,
      };
    } else {
      // Keep the last trustworthy values for audit/history, but explicitly
      // mark them unavailable so the UI cannot present stale DHT data as fresh.
      update.environment = {
        ...existingEnvironment,
        dhtValid: false,
        recordedAt: event.receivedAt,
      };
    }

    transaction.update(currentSiloRef, update);
  });
}

/**
 * Listen to gateway input and classify one event at a time. History existence is
 * the processed marker; inbox documents deliberately remain untouched.
 */
export function startAcousticInboxProcessor(
  fid: string,
  callbacks: AcousticProcessorCallbacks = {},
): () => void {
  const queued = new Map<string, unknown>();
  const processed = new Set<string>();
  const rejected = new Set<string>();
  let stopped = false;
  let pumping = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let activeScanId: string | null = null;
  let lastProcessedScanId: string | null = null;
  let error: string | null = null;

  const report = () =>
    callbacks.onStatus?.({
      pending: queued.size + (activeScanId ? 1 : 0),
      activeScanId,
      lastProcessedScanId,
      error,
    });

  const scheduleRetry = (pump: () => Promise<void>) => {
    if (retryTimer || stopped) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      pump().catch(cause => {
        error =
          cause instanceof Error
            ? cause.message
            : 'Acoustic processing failed.';
        report();
      });
    }, RETRY_DELAY_MS);
  };

  const pump = async (): Promise<void> => {
    if (pumping || stopped) return;
    pumping = true;

    while (!stopped && queued.size > 0) {
      const next = queued.entries().next().value as
        | [string, unknown]
        | undefined;
      if (!next) break;
      const [scanId, raw] = next;
      queued.delete(scanId);
      const guardKey = `${fid}/${scanId}`;
      if (
        processed.has(scanId) ||
        rejected.has(scanId) ||
        processingScanIds.has(guardKey)
      ) {
        continue;
      }

      processingScanIds.add(guardKey);
      activeScanId = scanId;
      error = null;
      report();

      try {
        await processEvent(fid, scanId, raw);
        processed.add(scanId);
        lastProcessedScanId = scanId;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Acoustic inference failed.';
        error = `${scanId}: ${message}`;
        if (cause instanceof AcousticContractError) {
          rejected.add(scanId);
        } else {
          queued.set(scanId, raw);
          scheduleRetry(pump);
        }
      } finally {
        processingScanIds.delete(guardKey);
        activeScanId = null;
        report();
      }

      if (error && queued.has(scanId)) break;
    }

    pumping = false;
  };

  const unsubscribe = onSnapshot(
    acousticInboxCollection(fid),
    snapshot => {
      // A first sign-in may expose a backlog. Classify the newest event first
      // so the dashboard becomes current immediately, then drain older events
      // for history. Firestore's default document-ID order is not chronology.
      const newestFirst = [...snapshot.docs].sort(
        (a, b) =>
          (millisOf(b.data().receivedAt) ?? 0) -
          (millisOf(a.data().receivedAt) ?? 0),
      );
      newestFirst.forEach(document => {
        if (
          !processed.has(document.id) &&
          !rejected.has(document.id) &&
          !processingScanIds.has(`${fid}/${document.id}`)
        ) {
          queued.set(document.id, document.data());
        }
      });
      report();
      pump().catch(cause => {
        error =
          cause instanceof Error
            ? cause.message
            : 'Acoustic processing failed.';
        report();
      });
    },
    cause => {
      error = cause.message;
      report();
    },
  );

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    queued.clear();
    unsubscribe();
  };
}

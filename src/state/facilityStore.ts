/**
 * The store the screens read.
 *
 * Everything the UI shows about a facility arrives through Firestore listeners.
 * There is no demo fallback: empty or failed reads remain explicit UI states.
 *
 * Two things worth knowing before editing:
 *
 * Freshness ages by itself. `minutesAgo` is derived when a snapshot arrives, so
 * without help "3 minutes ago" would still read three minutes an hour later. A
 * one-minute tick re-ages the current data in place while the store is attached,
 * which is also what pull-to-refresh calls.
 *
 * Thresholds are pushed into the model, not just held here. `applyThresholds`
 * mutates the shared LIMITS table so `bandOf` and every screen quoting a ceiling
 * agree; this store keeps the same values in state so that change re-renders.
 */

import { create } from 'zustand';

import {
  applyThresholds,
  DEFAULT_THRESHOLDS,
  type Silo,
  type ThresholdMap,
} from '../core/monitoring';
import type { AcousticEvent, Facility, VisionScan } from '../core/domain';
import {
  saveFacilityDetails,
  saveThresholds as writeThresholds,
  subscribeFacility,
} from '../services/facilityService';
import { STALE_AFTER_MINUTES } from '../services/mappers';
import {
  recordVisionScan,
  subscribeAcousticEvents,
  subscribeVisionScans,
  type VisionScanInput,
} from '../services/scanService';
import {
  startAcousticInboxProcessor,
  type AcousticProcessorStatus,
} from '../services/acousticInboxService';
import {
  subscribeProbes,
  updateProbeDetails,
} from '../services/probeService';
import { settle } from '../services/write';

const REAGE_INTERVAL_MS = 60_000;

/** Shown when a write fails without a usable message of its own. */
const WRITE_FAILED =
  'The change could not be saved. It will retry when the connection returns.';

type FacilityState = {
  facilityId: string | null;
  facility: Facility;
  silos: Silo[];
  acousticEvents: AcousticEvent[];
  visionScans: VisionScan[];
  thresholds: ThresholdMap;
  /** True once Firestore has delivered the tracked-probe collection. */
  probesLoaded: boolean;
  /** True when at least one real tracked probe exists. */
  live: boolean;
  loading: boolean;
  error: string | null;
  acousticProcessor: AcousticProcessorStatus;

  attach: (facilityId: string) => void;
  detach: () => void;
  reage: () => void;
  saveThresholds: (next: ThresholdMap) => Promise<string | null>;
  renameFacility: (patch: Partial<Facility>) => Promise<string | null>;
  editProbe: (
    internalId: string,
    patch: Partial<Pick<Silo, 'name' | 'crop'>>,
  ) => Promise<string | null>;
  saveVisionScan: (scan: VisionScanInput) => Promise<string | null>;
};

// Subscriptions and the aging clock live outside the state: they are machinery,
// not something a component should ever re-render over.
let unsubscribers: Array<() => void> = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let capturedAt = Date.now();

function teardown() {
  unsubscribers.forEach(stop => {
    try {
      stop();
    } catch {}
  });
  unsubscribers = [];
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

const EMPTY_FACILITY: Facility = {
  name: 'GrainGuard',
  operator: 'Operator',
  region: '',
  gatewayId: '',
  firmware: '',
};

const EMPTY_STATE = {
  facility: EMPTY_FACILITY,
  silos: [] as Silo[],
  acousticEvents: [] as AcousticEvent[],
  visionScans: [] as VisionScan[],
  thresholds: DEFAULT_THRESHOLDS,
  live: false,
  probesLoaded: false,
};

/** Shifts a silo's derived freshness forward by `minutes` of wall clock. */
function ageSilo(silo: Silo, minutes: number): Silo {
  const minutesAgo = silo.minutesAgo + minutes;
  return {
    ...silo,
    minutesAgo,
    nodeOnline: minutesAgo <= STALE_AFTER_MINUTES,
    acoustic: {
      ...silo.acoustic,
      minutesAgo: silo.acoustic.minutesAgo + minutes,
    },
    vision: { ...silo.vision, minutesAgo: silo.vision.minutesAgo + minutes },
  };
}

export const useFacilityStore = create<FacilityState>((set, get) => ({
  facilityId: null,
  ...EMPTY_STATE,
  loading: false,
  error: null,
  acousticProcessor: {
    pending: 0,
    activeScanId: null,
    lastProcessedScanId: null,
    error: null,
  },

  attach: (facilityId: string) => {
    if (get().facilityId === facilityId) return;
    teardown();
    capturedAt = Date.now();
    set({ facilityId, loading: true, error: null });

    const fail = (message: string) => set({ error: message, loading: false });

    unsubscribers.push(
      subscribeFacility(
        facilityId,
        record => {
          if (!record) {
            set({ loading: false, error: 'This store could not be opened.' });
            return;
          }
          set({
            facility: {
              name: record.name,
              operator: record.operator,
              region: record.region,
              gatewayId: record.gatewayId,
              firmware: record.firmware,
            },
            thresholds: applyThresholds(record.thresholds),
            loading: false,
            error: null,
          });
        },
        fail,
      ),
    );

    unsubscribers.push(
      subscribeProbes(
        facilityId,
        silos => {
          capturedAt = Date.now();
          set({
            silos,
            live: silos.length > 0,
            probesLoaded: true,
            loading: false,
          });
        },
        fail,
      ),
    );

    unsubscribers.push(
      subscribeAcousticEvents(
        facilityId,
        events => set({ acousticEvents: events }),
        fail,
      ),
    );

    unsubscribers.push(
      subscribeVisionScans(
        facilityId,
        scans => set({ visionScans: scans }),
        fail,
      ),
    );

    unsubscribers.push(
      startAcousticInboxProcessor(facilityId, {
        onStatus: acousticProcessor => set({ acousticProcessor }),
      }),
    );

    ticker = setInterval(() => get().reage(), REAGE_INTERVAL_MS);
  },

  detach: () => {
    teardown();
    applyThresholds(DEFAULT_THRESHOLDS);
    set({
      facilityId: null,
      ...EMPTY_STATE,
      loading: false,
      error: null,
      acousticProcessor: {
        pending: 0,
        activeScanId: null,
        lastProcessedScanId: null,
        error: null,
      },
    });
  },

  reage: () => {
    const state = get();
    if (!state.live) return;

    const drift = Math.round((Date.now() - capturedAt) / 60000);
    if (drift < 1) return;
    capturedAt += drift * 60000;

    set({
      silos: state.silos.map(silo => ageSilo(silo, drift)),
      acousticEvents: state.acousticEvents.map(e => ({
        ...e,
        minutesAgo: e.minutesAgo + drift,
      })),
      visionScans: state.visionScans.map(s => ({
        ...s,
        minutesAgo: s.minutesAgo + drift,
      })),
    });
  },

  saveThresholds: async (next: ThresholdMap) => {
    const fid = get().facilityId;
    // Apply locally first so the UI responds even offline; the write is queued
    // by the native SDK and the listener will confirm it.
    set({ thresholds: applyThresholds(next) });
    if (!fid)
      return 'Not signed in to a store — this change is local to the device.';
    return settle(
      writeThresholds(fid, next),
      'The limits could not be saved. They will retry when the connection returns.',
    );
  },

  renameFacility: async (patch: Partial<Facility>) => {
    const fid = get().facilityId;
    if (!fid) return 'Not signed in to a store.';
    return settle(saveFacilityDetails(fid, patch), WRITE_FAILED);
  },

  editProbe: async (internalId, patch) => {
    const fid = get().facilityId;
    if (!fid) return 'Not signed in to a store.';
    return settle(updateProbeDetails(fid, internalId, patch), WRITE_FAILED);
  },

  saveVisionScan: async (scan: VisionScanInput) => {
    const fid = get().facilityId;
    if (!fid)
      return 'Not signed in to a store — the scan stays on this device.';
    return settle(
      recordVisionScan(fid, scan),
      'The scan could not be filed. It will retry when the connection returns.',
    );
  },
}));

// ─── Selectors ───────────────────────────────────────────────────────
//
// Screens use these rather than reaching into the store, so a shape change here
// does not ripple through thirteen files. Each returns a stable reference from
// state — never a freshly built object, which would re-render on every commit.

export const useFacility = () => useFacilityStore(s => s.facility);
export const useSilos = () => useFacilityStore(s => s.silos);
export const useAcousticEvents = () => useFacilityStore(s => s.acousticEvents);
export const useVisionScans = () => useFacilityStore(s => s.visionScans);
export const useThresholds = () => useFacilityStore(s => s.thresholds);
export const useFacilityError = () => useFacilityStore(s => s.error);
export const useFacilityLoading = () => useFacilityStore(s => s.loading);
export const useAcousticProcessor = () =>
  useFacilityStore(s => s.acousticProcessor);

/** Whether at least one registered live probe exists. */
export const useProbesLoaded = () => useFacilityStore(s => s.probesLoaded);
export const useProbes = useSilos;

/**
 * One silo by id, falling back to the first. Derived outside the selector: a
 * selector that built a new object each call would re-render forever.
 */
export function useSilo(id: string | undefined): Silo {
  const silos = useSilos();
  if (!id) return silos[0];
  return silos.find(s => s.id === id) ?? silos[0];
}

export const facilityActions = () => useFacilityStore.getState();

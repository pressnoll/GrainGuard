/**
 * The facility document — a store, its gateway, and its safe limits.
 *
 * Telemetry hangs off the facility rather than off the user because a store is
 * shared: a cooperative has one set of silos and several people reading them.
 * `memberUids` is the list the security rules check, so adding a colleague later
 * is one array append rather than a data migration.
 *
 * `provisionFacility` is the sign-up path. It creates an empty facility and
 * points the user document at it in one batch. Real monitoring begins only
 * after an inbox-backed probe is registered.
 */

import {
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';

import {
  DEFAULT_THRESHOLDS,
  METRIC_KEYS,
  type MetricKey,
  type ThresholdMap,
} from '../core/monitoring';
import type { Facility } from '../core/domain';
import { DEPLOYMENT } from '../config';

import { db } from './firebase';
import { facilityFromDoc } from './mappers';
import {
  facilitiesCollection,
  facilityDoc,
  userDoc,
} from './paths';

export type FacilityRecord = Facility & {
  id: string;
  ownerUid: string;
  thresholds: ThresholdMap;
};

/**
 * Connect the existing defence account to the gateway's fixed live route.
 * This writes ownership metadata only; it never creates probe state, inbox
 * events, measurements, classifications, or history.
 */
export async function connectDefenceFacility(
  uid: string,
  operatorName: string,
): Promise<string> {
  const batch = writeBatch(db());
  batch.set(
    facilityDoc(DEPLOYMENT.facilityId),
    {
      name: DEPLOYMENT.facilityName,
      operator: operatorName.trim() || 'Operator',
      ownerUid: uid,
      memberUids: [uid],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.update(userDoc(uid), { facilityId: DEPLOYMENT.facilityId });
  await batch.commit();
  return DEPLOYMENT.facilityId;
}

/** Reads the saved ceilings, falling back per metric so a partial map is safe. */
export function thresholdsFromDoc(data: unknown): ThresholdMap {
  const raw = (data ?? {}) as Record<string, unknown>;
  return METRIC_KEYS.reduce((acc, key) => {
    const value = raw[key];
    acc[key] = typeof value === 'number' && Number.isFinite(value)
      ? value
      : DEFAULT_THRESHOLDS[key];
    return acc;
  }, {} as ThresholdMap);
}

export function facilityRecordFromDoc(
  id: string,
  data: Record<string, unknown> | undefined,
): FacilityRecord {
  const d = data ?? {};
  return {
    id,
    ...facilityFromDoc(d),
    ownerUid: typeof d.ownerUid === 'string' ? d.ownerUid : '',
    thresholds: thresholdsFromDoc(d.thresholds),
  };
}

/**
 * Create an empty facility for a brand-new account. No measurement, probe,
 * gateway identity, or history is invented during provisioning.
 */
export async function provisionFacility(uid: string, operatorName: string): Promise<string> {
  const facilityRef = doc(facilitiesCollection());
  const fid = facilityRef.id;
  const batch = writeBatch(db());
  const operator = operatorName.trim() || 'Operator';

  batch.set(facilityRef, {
    name: `${operator}'s GrainGuard`,
    operator,
    region: '',
    gatewayId: '',
    firmware: '',
    ownerUid: uid,
    memberUids: [uid],
    thresholds: DEFAULT_THRESHOLDS,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Same batch as the store itself: if this fails, no facility exists to be
  // stranded without an owner pointing at it.
  batch.update(userDoc(uid), { facilityId: fid });

  await batch.commit();
  return fid;
}

/**
 * The store this account should open. Returns an existing membership when there
 * is one — a reinstall or a second device must not create a duplicate store —
 * and otherwise provisions a fresh seeded one.
 */
export async function resolveFacility(
  uid: string,
  linkedFacilityId: string | null,
  operatorName: string,
): Promise<string> {
  let accessError: unknown = null;

  // Never trust a stale profile pointer blindly. A copied/test profile can
  // point at a facility the current Firebase UID is not allowed to open.
  if (linkedFacilityId) {
    try {
      const linked = await getDoc(facilityDoc(linkedFacilityId));
      if (linked.exists()) return linkedFacilityId;
    } catch (error) {
      accessError = error;
    }
  }

  try {
    const membership = await getDocs(
      query(
        facilitiesCollection(),
        where('memberUids', 'array-contains', uid),
        limit(1),
      ),
    );
    if (!membership.empty) {
      const fid = membership.docs[0].id;
      await updateDoc(userDoc(uid), { facilityId: fid });
      return fid;
    }
  } catch (error) {
    accessError = accessError ?? error;
  }

  // Compatibility path for facilities created before memberUids was added.
  try {
    const ownership = await getDocs(
      query(
        facilitiesCollection(),
        where('ownerUid', '==', uid),
        limit(1),
      ),
    );
    if (!ownership.empty) {
      const fid = ownership.docs[0].id;
      await updateDoc(userDoc(uid), { facilityId: fid });
      return fid;
    }
  } catch (error) {
    accessError = accessError ?? error;
  }

  // A rules failure is not evidence that the account has no facility. Creating
  // another one here would strand the gateway data under the original path.
  if (accessError) throw accessError;
  return provisionFacility(uid, operatorName);
}

export function subscribeFacility(
  fid: string,
  next: (facility: FacilityRecord | null) => void,
  onError?: (message: string) => void,
): () => void {
  return onSnapshot(
    facilityDoc(fid),
    snapshot =>
      next(snapshot.exists() ? facilityRecordFromDoc(fid, snapshot.data()) : null),
    error => onError?.(error.message),
  );
}

export async function saveThresholds(fid: string, thresholds: ThresholdMap): Promise<void> {
  const clean = METRIC_KEYS.reduce((acc, key) => {
    acc[key] = thresholds[key];
    return acc;
  }, {} as Record<MetricKey, number>);

  await updateDoc(facilityDoc(fid), { thresholds: clean, updatedAt: serverTimestamp() });
}

export async function saveFacilityDetails(
  fid: string,
  patch: Partial<Pick<Facility, 'name' | 'operator' | 'region' | 'gatewayId' | 'firmware'>>,
): Promise<void> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'string' && value.trim()) clean[key] = value.trim();
  }
  if (Object.keys(clean).length === 0) return;
  await updateDoc(facilityDoc(fid), { ...clean, updatedAt: serverTimestamp() });
}

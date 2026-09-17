/** Single-probe state over the deployed gateway schema. */
import {
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from '@react-native-firebase/firestore';

import { DEPLOYMENT } from '../config';
import type { Silo } from '../core/monitoring';
import { siloFromDoc } from './mappers';
import { siloDoc } from './paths';

export function subscribeProbes(
  fid: string,
  next: (probes: Silo[]) => void,
  onError?: (message: string) => void,
): () => void {
  return onSnapshot(
    siloDoc(fid, DEPLOYMENT.stateRecordId),
    snapshot => {
      if (!snapshot.exists()) {
        next([]);
        return;
      }
      const data = snapshot.data();
      const reportedProbeId = data?.probeId;
      if (
        typeof reportedProbeId === 'string' &&
        reportedProbeId !== DEPLOYMENT.probeId
      ) {
        onError?.(
          `The configured state record belongs to ${reportedProbeId}, not ${DEPLOYMENT.probeId}.`,
        );
        next([]);
        return;
      }
      next([siloFromDoc(snapshot.id, data, Date.now())]);
    },
    error => onError?.(error.message),
  );
}

export async function updateProbeDetails(
  fid: string,
  internalId: string,
  patch: Partial<Pick<Silo, 'name' | 'crop'>>,
): Promise<void> {
  const clean: Record<string, unknown> = {};
  if (typeof patch.name === 'string' && patch.name.trim()) clean.name = patch.name.trim();
  if (patch.crop) clean.crop = patch.crop;
  if (!Object.keys(clean).length) return;
  await updateDoc(siloDoc(fid, internalId), {
    ...clean,
    updatedAt: serverTimestamp(),
  });
}

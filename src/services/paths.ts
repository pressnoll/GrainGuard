/**
 * Firestore layout.
 *
 * One place that knows where every document lives, so a rename is one edit
 * rather than a grep across the services. The shape:
 *
 *   users/{uid}                                  profile, role, facility pointer
 *   facilities/{fid}                             store identity, gateway, thresholds
 *   facilities/{fid}/silos/{siloId}              current state of one silo
 *   facilities/{fid}/acousticInbox/{scanId}      gateway input awaiting inference
 *   facilities/{fid}/acousticEvents/{eventId}    detection log
 *   facilities/{fid}/visionScans/{scanId}        scan history
 *
 * Telemetry hangs off the facility rather than off the user because a store is
 * shared: a cooperative has one set of silos and several people reading them.
 * `users/{uid}.facilityId` is the pointer from a login to its store, and
 * `facilities/{fid}.memberUids` is the list the security rules check.
 */

import { collection, doc } from '@react-native-firebase/firestore';

import { db } from './firebase';

export const USERS = 'users';
export const FACILITIES = 'facilities';
export const SILOS = 'silos';
export const ACOUSTIC_INBOX = 'acousticInbox';
export const ACOUSTIC_EVENTS = 'acousticEvents';
export const VISION_SCANS = 'visionScans';

export const userDoc = (uid: string) => doc(db(), USERS, uid);

export const facilitiesCollection = () => collection(db(), FACILITIES);
export const facilityDoc = (fid: string) => doc(db(), FACILITIES, fid);

export const silosCollection = (fid: string) =>
  collection(db(), FACILITIES, fid, SILOS);
export const siloDoc = (fid: string, siloId: string) =>
  doc(db(), FACILITIES, fid, SILOS, siloId);

export const acousticInboxCollection = (fid: string) =>
  collection(db(), FACILITIES, fid, ACOUSTIC_INBOX);
export const acousticInboxDoc = (fid: string, scanId: string) =>
  doc(db(), FACILITIES, fid, ACOUSTIC_INBOX, scanId);

export const acousticEventsCollection = (fid: string) =>
  collection(db(), FACILITIES, fid, ACOUSTIC_EVENTS);
export const acousticEventDoc = (fid: string, eventId: string) =>
  doc(db(), FACILITIES, fid, ACOUSTIC_EVENTS, eventId);

export const visionScansCollection = (fid: string) =>
  collection(db(), FACILITIES, fid, VISION_SCANS);
export const visionScanDoc = (fid: string, scanId: string) =>
  doc(db(), FACILITIES, fid, VISION_SCANS, scanId);

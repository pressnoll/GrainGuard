/**
 * The user document.
 *
 * `users/{uid}` holds what belongs to a person rather than to a store: their
 * name, role, and the pointer to the facility they read. It is
 * created on first sign-in — including a Google sign-in for an account that
 * already exists in Firebase Auth but has never had a profile written, which
 * happens if the user was created in the console.
 */

import { getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from '@react-native-firebase/firestore';
import type { User } from '@react-native-firebase/auth';

import { userDoc } from './paths';

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  /** Optional contact number. */
  phone: string;
  photoURL: string | null;
  role: string;
  facilityId: string | null;
};

/** A usable name even when the provider gave none — never a blank row in the UI. */
function nameFor(user: User): string {
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  const local = user.email?.split('@')[0] ?? '';
  return local || 'Operator';
}

export function profileFromDoc(uid: string, data: Record<string, unknown> | undefined): UserProfile {
  const d = data ?? {};
  return {
    uid,
    displayName: typeof d.displayName === 'string' && d.displayName ? d.displayName : 'Operator',
    email: typeof d.email === 'string' ? d.email : '',
    phone: typeof d.phone === 'string' ? d.phone : '',
    photoURL: typeof d.photoURL === 'string' && d.photoURL ? d.photoURL : null,
    role: typeof d.role === 'string' && d.role ? d.role : 'Store manager',
    facilityId: typeof d.facilityId === 'string' && d.facilityId ? d.facilityId : null,
  };
}

/**
 * Read the profile, creating it if this is the first time we have seen the
 * account. Returns the profile either way.
 *
 * The write uses merge so a second device signing in cannot clear a facility
 * pointer or preferences that the first one set.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const ref = userDoc(user.uid);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    const existing = profileFromDoc(user.uid, snapshot.data());
    // Keep the identity fields in step with the provider without touching
    // anything the operator has edited.
    await setDoc(
      ref,
      {
        email: user.email ?? existing.email,
        photoURL: user.photoURL ?? existing.photoURL,
        lastSeenAt: serverTimestamp(),
      },
      { merge: true },
    );
    return existing;
  }

  const profile: UserProfile = {
    uid: user.uid,
    displayName: nameFor(user),
    email: user.email ?? '',
    phone: user.phoneNumber ?? '',
    photoURL: user.photoURL ?? null,
    role: 'Store manager',
    facilityId: null,
  };

  await setDoc(ref, {
    displayName: profile.displayName,
    email: profile.email,
    phone: profile.phone,
    photoURL: profile.photoURL,
    role: profile.role,
    facilityId: null,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });

  return profile;
}

export function subscribeUserProfile(
  uid: string,
  next: (profile: UserProfile | null) => void,
  onError?: (message: string) => void,
): () => void {
  return onSnapshot(
    userDoc(uid),
    snapshot => next(snapshot.exists() ? profileFromDoc(uid, snapshot.data()) : null),
    error => onError?.(error.message),
  );
}

/**
 * Saves the fields the operator can edit.
 *
 * A cleared phone number is a real edit, so it is written through; a blank name
 * or role is not, because both are used as labels and an empty label is a bug
 * rather than a preference.
 */
export async function saveProfileDetails(
  uid: string,
  patch: { displayName?: string; role?: string; phone?: string },
): Promise<void> {
  const clean: Record<string, string> = {};
  if (patch.displayName?.trim()) clean.displayName = patch.displayName.trim();
  if (patch.role?.trim()) clean.role = patch.role.trim();
  if (patch.phone !== undefined) clean.phone = patch.phone.trim();
  if (Object.keys(clean).length === 0) return;
  await updateDoc(userDoc(uid), clean);
}

export async function linkFacility(uid: string, facilityId: string): Promise<void> {
  await updateDoc(userDoc(uid), { facilityId });
}

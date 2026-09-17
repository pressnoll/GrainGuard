/**
 * Firebase handles.
 *
 * react-native-firebase v26 is modular-only: there is no `firebase.auth()`
 * namespace any more, so everything below goes through `getAuth` / `getFirestore`
 * and the free functions those packages export.
 *
 * The default app is configured natively — from android/app/google-services.json
 * via the com.google.gms.google-services Gradle plugin, and on iOS from
 * GoogleService-Info.plist plus FirebaseApp.configure() in AppDelegate. If either
 * of those is missing, `getApp()` throws. It is called lazily here rather than at
 * module scope so a misconfigured build surfaces as a readable message on the
 * sign-in screen instead of a white screen before any JavaScript renders.
 *
 * Offline behaviour is the native SDK's own: Firestore persistence is on by
 * default on Android and iOS, so a warm cache serves reads with no network and
 * writes are queued until it returns.
 */

import { getApp } from '@react-native-firebase/app';
import { getAuth, type Auth } from '@react-native-firebase/auth';
import { getFirestore, type Firestore } from '@react-native-firebase/firestore';

let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let initError: string | null = null;

const CONFIG_HINT =
  'Firebase is not configured for this build. Check that android/app/google-services.json exists and that the com.google.gms.google-services plugin is applied, then rebuild the app — a Metro reload is not enough.';

/**
 * True when the native default app exists. Cheap enough to call on render;
 * the result is cached after the first attempt.
 */
export function firebaseAvailable(): boolean {
  if (cachedAuth && cachedDb) return true;
  if (initError) return false;
  try {
    const app = getApp();
    cachedAuth = getAuth(app);
    cachedDb = getFirestore(app);
    return true;
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

/** Human-readable reason Firebase is unavailable, or null when it is fine. */
export function firebaseProblem(): string | null {
  if (firebaseAvailable()) return null;
  return CONFIG_HINT;
}

export function auth(): Auth {
  if (!firebaseAvailable() || !cachedAuth) throw new Error(CONFIG_HINT);
  return cachedAuth;
}

export function db(): Firestore {
  if (!firebaseAvailable() || !cachedDb) throw new Error(CONFIG_HINT);
  return cachedDb;
}

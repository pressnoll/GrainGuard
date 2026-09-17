/**
 * Google Sign-In configuration.
 *
 * Google sign-in on Android needs the OAuth **web** client ID, not the Android
 * one. Firebase exchanges the ID token that client issues; without it the native
 * SDK never calls requestIdToken and hands back `idToken: null`, which cannot be
 * turned into a Firebase credential.
 *
 * The client ID is not in android/app/google-services.json as it stands — the
 * file has an empty `oauth_client` array, which means no signing certificate has
 * been registered against the Firebase project yet. To turn Google sign-in on:
 *
 *   1. Get the debug signing fingerprint:
 *        cd android && ./gradlew signingReport
 *      and copy the SHA1 of the `debug` variant.
 *   2. Firebase console -> Project settings -> Your apps -> com.grainguard ->
 *      Add fingerprint, paste the SHA-1, save.
 *   3. Authentication -> Sign-in method -> enable Google.
 *   4. Download the fresh google-services.json over android/app/google-services.json.
 *   5. Open it and find the entry under `oauth_client` whose `client_type` is 3.
 *      That is the web client. Paste its `client_id` below.
 *   6. Rebuild the app — the Gradle plugin reads the JSON at build time, so a
 *      Metro reload will not pick it up.
 *
 * A release build needs its own fingerprint added the same way, from the upload
 * keystore rather than debug.keystore.
 *
 * Email and password sign-in needs none of this and works as soon as it is
 * enabled under Authentication -> Sign-in method.
 */

/** Paste the `client_type: 3` client_id from google-services.json here. */
export const GOOGLE_WEB_CLIENT_ID = '735500376715-ccht8g34slt5a1bpkttn7211k4lnkrjp.apps.googleusercontent.com';

export const googleSignInConfigured = () => GOOGLE_WEB_CLIENT_ID.trim().length > 0;

export const GOOGLE_SETUP_HINT =
  'Google sign-in is not set up for this build yet. Register the app signing fingerprint in the Firebase console, download google-services.json again and paste the web client ID into src/services/oauth.ts. Email and password sign-in works now.';

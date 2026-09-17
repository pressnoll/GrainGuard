/**
 * Authentication.
 *
 * Email/password and Google, both landing on the same Firebase user so the rest
 * of the app never has to care which was used.
 *
 * Every entry point resolves to `{ ok: true }` or `{ ok: false, message }` rather
 * than throwing. Auth failures are a normal outcome of a form — wrong password,
 * no network, address already registered — and the screen needs a sentence it can
 * put under a field, not a stack trace. `friendlyAuthError` does that
 * translation; Firebase's own messages leak internals ("The password is invalid
 * or the user does not have a password") and name codes the operator cannot act
 * on.
 */

import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from '@react-native-firebase/auth';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';

import { auth, firebaseProblem } from './firebase';
import { GOOGLE_SETUP_HINT, GOOGLE_WEB_CLIENT_ID, googleSignInConfigured } from './oauth';

export type AuthOutcome =
  | { ok: true; user: User; isNewUser: boolean }
  | { ok: false; message: string; cancelled?: boolean };

export type SimpleOutcome = { ok: true } | { ok: false; message: string };

/** Fires immediately with the restored session, then on every change. */
export function watchAuthState(next: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth(), next);
}

export function currentUser(): User | null {
  return auth().currentUser;
}

// ─── Email and password ──────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  const blocked = configProblem();
  if (blocked) return blocked;
  try {
    const credential = await signInWithEmailAndPassword(auth(), email.trim(), password);
    return { ok: true, user: credential.user, isNewUser: false };
  } catch (error) {
    return { ok: false, message: friendlyAuthError(error) };
  }
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const blocked = configProblem();
  if (blocked) return blocked;
  try {
    const credential = await createUserWithEmailAndPassword(auth(), email.trim(), password);
    const trimmed = name.trim();
    if (trimmed) {
      // Best effort. A missing display name is cosmetic, and failing the whole
      // sign-up over it would leave an account the operator cannot get back into.
      try {
        await updateProfile(credential.user, { displayName: trimmed });
      } catch {}
    }
    return { ok: true, user: credential.user, isNewUser: true };
  } catch (error) {
    return { ok: false, message: friendlyAuthError(error) };
  }
}

export async function sendReset(email: string): Promise<SimpleOutcome> {
  const blocked = configProblem();
  if (blocked) return { ok: false, message: blocked.message };
  try {
    await sendPasswordResetEmail(auth(), email.trim());
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyAuthError(error) };
  }
}

/**
 * Password change. Firebase requires a recent login for this, so the current
 * password is taken as well and used to re-authenticate first — otherwise the
 * call fails with `auth/requires-recent-login` for anyone who signed in earlier
 * in the day.
 */
export async function changePassword(
  currentPassword: string,
  nextPassword: string,
): Promise<SimpleOutcome> {
  const user = currentUser();
  if (!user || !user.email) {
    return { ok: false, message: 'Sign in again before changing your password.' };
  }
  try {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword),
    );
    await updatePassword(user, nextPassword);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyAuthError(error) };
  }
}

// ─── Google ──────────────────────────────────────────────────────────

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<AuthOutcome> {
  const blocked = configProblem();
  if (blocked) return blocked;
  if (!googleSignInConfigured()) return { ok: false, message: GOOGLE_SETUP_HINT };

  try {
    configureGoogle();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return { ok: false, message: 'Sign-in cancelled.', cancelled: true };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      // Reached when the web client ID is wrong for this project rather than
      // simply absent, which is otherwise a very quiet failure.
      return { ok: false, message: GOOGLE_SETUP_HINT };
    }

    const credential = await signInWithCredential(
      auth(),
      GoogleAuthProvider.credential(idToken),
    );

    return {
      ok: true,
      user: credential.user,
      isNewUser: credential.additionalUserInfo?.isNewUser === true,
    };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { ok: false, message: 'Sign-in cancelled.', cancelled: true };
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        return { ok: false, message: 'A sign-in is already in progress.' };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          ok: false,
          message: 'Google Play services is missing or out of date on this device.',
        };
      }
    }
    return { ok: false, message: friendlyAuthError(error) };
  }
}

// ─── Sign out ────────────────────────────────────────────────────────

/**
 * Clears the Firebase session and the cached Google account. Without the second
 * part, signing out and back in silently reuses the previous Google account with
 * no chooser, which reads as a bug.
 */
export async function signOutEverywhere(): Promise<SimpleOutcome> {
  try {
    if (googleConfigured) {
      try {
        await GoogleSignin.signOut();
      } catch {}
    }
    await signOut(auth());
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyAuthError(error) };
  }
}

// ─── Errors ──────────────────────────────────────────────────────────

function configProblem(): { ok: false; message: string } | null {
  const problem = firebaseProblem();
  return problem ? { ok: false, message: problem } : null;
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled. Contact the store administrator.',
  'auth/user-not-found': 'No account exists for that email address.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'That email and password combination is not recognised.',
  'auth/invalid-login-credentials': 'That email and password combination is not recognised.',
  'auth/email-already-in-use': 'An account already exists for that email address. Sign in instead.',
  'auth/weak-password': 'Choose a longer password — at least eight characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check the network and try again.',
  'auth/requires-recent-login': 'Sign in again before making this change.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled for the project. Turn it on under Authentication in the Firebase console.',
  'auth/account-exists-with-different-credential':
    'That email address is already registered with a different sign-in method.',
};

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code];
  const message = (error as { message?: unknown })?.message;
  if (typeof message === 'string' && message.length > 0) return message;
  return 'Something went wrong. Try again.';
}

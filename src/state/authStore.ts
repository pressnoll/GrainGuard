/**
 * Session state.
 *
 * One listener on Firebase Auth drives everything. When it reports a user, this
 * store makes sure a profile document exists, works out which store that account
 * opens — creating and seeding one on first sign-up — and hands the id to the
 * facility store. When it reports null, all of that is torn down.
 *
 * The screens never call the auth SDK directly. They call the actions here, which
 * return a message string on failure and null on success, because a thrown error
 * inside an onPress handler in React Native is a red screen rather than a
 * sentence the operator can act on.
 *
 * `bootstrapping` is what the navigator waits on. It stays true until the first
 * auth callback has been fully resolved — including the facility lookup — so the
 * app never flashes the sign-in screen at someone who is already signed in.
 */

import { create } from 'zustand';
import type { User } from '@react-native-firebase/auth';

import {
  changePassword as changeAuthPassword,
  sendReset,
  signInWithEmail,
  signInWithGoogle,
  signOutEverywhere,
  signUpWithEmail,
  watchAuthState,
} from '../services/authService';
import { connectDefenceFacility } from '../services/facilityService';
import { firebaseAvailable, firebaseProblem } from '../services/firebase';
import { googleSignInConfigured } from '../services/oauth';
import {
  ensureUserProfile,
  saveProfileDetails,
  subscribeUserProfile,
  type UserProfile,
} from '../services/userService';
import { settle } from '../services/write';

import { useFacilityStore } from './facilityStore';

type AuthState = {
  /** True until the first auth callback has been resolved end to end. */
  bootstrapping: boolean;
  user: User | null;
  profile: UserProfile | null;
  /** A sign-in, sign-up or sign-out is in flight. */
  busy: boolean;
  /** Last failure, for the banner on the auth screen. */
  error: string | null;
  /** A confirmation worth showing — a reset email sent, a password changed. */
  notice: string | null;
  /** Set when the build itself is wrong, e.g. the Gradle plugin is missing. */
  configProblem: string | null;
  googleReady: boolean;

  start: () => () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signInGoogle: () => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  changePassword: (current: string, next: string) => Promise<string | null>;
  signOut: () => Promise<string | null>;
  saveDetails: (patch: {
    displayName?: string;
    role?: string;
    phone?: string;
  }) => Promise<string | null>;
  clearMessages: () => void;
};

// Listener handles and a generation counter, kept out of state. The counter
// matters: signing out while a facility lookup is still in flight would
// otherwise let the stale result attach a store to nobody.
let stopAuth: (() => void) | null = null;
let stopProfile: (() => void) | null = null;
let generation = 0;

function stopProfileWatch() {
  if (stopProfile) {
    try {
      stopProfile();
    } catch {}
    stopProfile = null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  bootstrapping: true,
  user: null,
  profile: null,
  busy: false,
  error: null,
  notice: null,
  configProblem: null,
  googleReady: googleSignInConfigured(),

  start: () => {
    if (stopAuth) return stopAuth;

    if (!firebaseAvailable()) {
      // Nothing to listen to. Surface the configuration failure rather than
      // hanging on a splash screen or substituting sample data.
      set({ bootstrapping: false, configProblem: firebaseProblem() });
      stopAuth = () => {};
      return stopAuth;
    }

    stopAuth = watchAuthState(async user => {
      const mine = ++generation;
      stopProfileWatch();

      if (!user) {
        useFacilityStore.getState().detach();
        set({ user: null, profile: null, bootstrapping: false });
        return;
      }

      set({ user });

      try {
        const profile = await ensureUserProfile(user);
        if (mine !== generation) return;
        set({ profile });

        const fid = await connectDefenceFacility(user.uid, profile.displayName);
        if (mine !== generation) return;

        useFacilityStore.getState().attach(fid);
        set({ profile: { ...profile, facilityId: fid }, bootstrapping: false, error: null });

        // Live profile so a preference changed on another device shows here.
        stopProfile = subscribeUserProfile(user.uid, next => {
          if (mine === generation && next) set({ profile: next });
        });
      } catch (error) {
        if (mine !== generation) return;
        // Signed in, but the store could not be opened — almost always security
        // rules that have not been deployed yet. Route to an explicit
        // connection failure instead of opening setup against an unreadable
        // facility or substituting data.
        set({
          bootstrapping: false,
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Signed in, but your store could not be opened.',
        });
      }
    });

    return stopAuth;
  },

  signIn: async (email: string, password: string) => {
    set({ busy: true, error: null, notice: null });
    const result = await signInWithEmail(email, password);
    // On success the auth listener takes over; leave busy set so the button
    // stays disabled through the handover instead of flickering.
    if (!result.ok) set({ busy: false, error: result.message });
    else set({ busy: false });
    return result.ok ? null : result.message;
  },

  signUp: async (name: string, email: string, password: string) => {
    set({ busy: true, error: null, notice: null });
    const result = await signUpWithEmail(name, email, password);
    set({ busy: false, error: result.ok ? null : result.message });
    return result.ok ? null : result.message;
  },

  signInGoogle: async () => {
    set({ busy: true, error: null, notice: null });
    const result = await signInWithGoogle();
    if (result.ok) {
      set({ busy: false });
      return null;
    }
    // A cancelled sheet is not a failure — no banner for it.
    set({ busy: false, error: result.cancelled ? null : result.message });
    return result.cancelled ? null : result.message;
  },

  resetPassword: async (email: string) => {
    set({ busy: true, error: null, notice: null });
    const result = await sendReset(email);
    set({
      busy: false,
      error: result.ok ? null : result.message,
      notice: result.ok ? 'Reset link sent. Check your inbox and spam folder.' : null,
    });
    return result.ok ? null : result.message;
  },

  changePassword: async (current: string, next: string) => {
    set({ busy: true, error: null, notice: null });
    const result = await changeAuthPassword(current, next);
    set({
      busy: false,
      error: result.ok ? null : result.message,
      notice: result.ok ? 'Password updated.' : null,
    });
    return result.ok ? null : result.message;
  },

  signOut: async () => {
    set({ busy: true, error: null, notice: null });
    // Drop the listeners before the credential goes, so a snapshot arriving
    // mid-sign-out cannot raise a permission error on the way out.
    generation++;
    stopProfileWatch();
    useFacilityStore.getState().detach();

    const result = await signOutEverywhere();
    set({ busy: false, user: null, profile: null, error: result.ok ? null : result.message });
    return result.ok ? null : result.message;
  },

  saveDetails: async (patch: { displayName?: string; role?: string; phone?: string }) => {
    const profile = get().profile;
    if (!profile) return 'Not signed in.';

    const message = await settle(
      saveProfileDetails(profile.uid, patch),
      'Profile could not be saved.',
    );
    if (message) return message;

    set({
      profile: {
        ...profile,
        displayName: patch.displayName?.trim() || profile.displayName,
        role: patch.role?.trim() || profile.role,
        phone: patch.phone !== undefined ? patch.phone.trim() : profile.phone,
      },
    });
    return null;
  },

  clearMessages: () => set({ error: null, notice: null }),
}));

// ─── Selectors ───────────────────────────────────────────────────────

export const useSignedIn = () => useAuthStore(s => s.user !== null);
export const useBootstrapping = () => useAuthStore(s => s.bootstrapping);
export const useProfile = () => useAuthStore(s => s.profile);
export const useAuthBusy = () => useAuthStore(s => s.busy);
export const useAuthError = () => useAuthStore(s => s.error);
export const useAuthNotice = () => useAuthStore(s => s.notice);
export const useConfigProblem = () => useAuthStore(s => s.configProblem);
export const useGoogleReady = () => useAuthStore(s => s.googleReady);

/** The operator's name and role for headers and the settings row. */
export const useOperatorName = () =>
  useAuthStore(s => s.profile?.displayName ?? 'Operator');
export const useOperatorEmail = () => useAuthStore(s => s.profile?.email ?? '');
export const useOperatorRole = () =>
  useAuthStore(s => s.profile?.role ?? 'Store manager');

export const authActions = () => useAuthStore.getState();

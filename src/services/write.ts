/**
 * Awaiting a Firestore write without waiting for the network.
 *
 * The native SDK applies a write to its local cache immediately, fires the
 * snapshot listeners from that cache, and only resolves the promise it returned
 * once the server acknowledges the write. Offline, that promise never settles —
 * so a screen that awaits it holds a spinner up indefinitely even though the
 * change is already on screen and already persisted to disk. For an app used in
 * a grain store with intermittent signal, that is the normal case rather than
 * the edge case.
 *
 * `settle` therefore stops waiting after a short deadline and reports success:
 * past that point the write is queued by the SDK and will sync on its own. If it
 * is rejected later — a rules denial, say — the listener rolls the optimistic
 * value back, which is the correction the operator actually needs; the message
 * itself is lost, and that is the trade being made here. A rejection inside the
 * deadline is reported normally, so genuine errors still reach the screen.
 */

/** Long enough for a healthy round trip, short enough not to read as a hang. */
const DEADLINE_MS = 4000;

/**
 * Resolves to null when the write succeeded or was queued, or to a message
 * explaining why it failed. Never rejects.
 */
export function settle(write: Promise<unknown>, fallback: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Built first so `timer` is assigned before the write can settle and try to
  // clear it — promise executors run synchronously.
  const deadline = new Promise<string | null>(resolve => {
    timer = setTimeout(() => resolve(null), DEADLINE_MS);
  });

  // This branch never rejects, so a failure arriving after the race has already
  // been decided cannot surface as an unhandled rejection.
  const reported = write
    .then(
      () => null,
      (error: unknown) => (error instanceof Error && error.message ? error.message : fallback),
    )
    .finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });

  return Promise.race([reported, deadline]);
}

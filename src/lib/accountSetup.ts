export type SetupSnapshot = {
  // Clerk session identity only binds pending UI intent; Convex still authorizes every backend operation.
  identity: string | null | undefined;
  authenticated: boolean;
  loading: boolean;
  player: boolean | undefined;
};

// Shared by the session provider and offline tests. No Clerk client, network, or gameplay side effects.
export function createAccountSetup(show: (open: boolean) => void, signIn: () => void) {
  let active = false;
  let snapshot: SetupSnapshot | undefined;
  let generation = 0;
  let needsSetup = false;
  const waiters = new Set<(ok: boolean) => void>();

  const finish = (ok: boolean) => {
    const pending = [...waiters];
    waiters.clear();
    pending.forEach((resolve) => resolve(ok));
  };
  const cancel = () => {
    generation++;
    finish(false);
    show(false);
  };
  const ready = () => snapshot && snapshot.identity !== undefined && !snapshot.loading
    && (!snapshot.authenticated || (snapshot.identity !== null && snapshot.player !== undefined));
  const flush = () => {
    if (!active || !ready()) return;
    if (!snapshot!.authenticated) {
      const requested = waiters.size > 0;
      finish(false);
      if (requested) signIn();
    } else if (snapshot!.player) {
      finish(true);
      show(false);
    } else if (waiters.size) show(true);
  };

  return {
    mount() { active = true; },
    update(next: SetupSnapshot) {
      if (!active) return;
      // Unknown identity at first load can bind once. A known session may never transfer its waiting actions.
      if (snapshot?.identity !== undefined && snapshot.identity !== next.identity) {
        cancel();
        needsSetup = false;
      }
      snapshot = next;
      const nextNeedsSetup = !!(ready() && next.authenticated && !next.player);
      if (nextNeedsSetup && !needsSetup) show(true);
      needsSetup = nextNeedsSetup;
      flush();
    },
    request() {
      if (!active) return Promise.resolve(false);
      const result = new Promise<boolean>((resolve) => waiters.add(resolve));
      flush();
      return result;
    },
    cancel,
    async submit(join: () => Promise<unknown>) {
      if (!active || !ready() || !snapshot!.authenticated || snapshot!.player) return;
      const attempt = generation;
      try {
        await join();
        // Success is published by update() only after the player query is ready (also covers another tab).
      } catch (error) {
        // A late failure from a canceled/previous session must not cancel newer callers.
        if (active && attempt === generation) finish(false);
        throw error;
      }
    },
    dispose() {
      active = false;
      cancel();
      snapshot = undefined;
      needsSetup = false;
    },
  };
}

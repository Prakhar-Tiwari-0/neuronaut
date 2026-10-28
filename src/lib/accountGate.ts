// Coordinates actions waiting for Convex authentication and a confirmed player row.
// A generation belongs to one session/setup attempt; stale callbacks cannot release a newer attempt.
export type AccountState = "loading" | "signed-out" | "needs-handle" | "ready";

export function createAccountGate() {
  let active = true;
  let session: string | null | undefined;
  let state: AccountState = "loading";
  let generation = 0;
  const waiting = new Set<(ok: boolean) => void>();
  const settle = (ok: boolean) => {
    const pending = [...waiting];
    waiting.clear();
    pending.forEach((resolve) => resolve(ok));
  };
  const cancel = () => {
    generation++;
    settle(false);
  };
  return {
    cancel,
    async setup(operation: () => Promise<unknown>) {
      const ticket = generation;
      try {
        await operation();
        // Success is confirmed by update(..., "ready"), not the mutation response.
      } catch (error) {
        if (active && ticket === generation) cancel();
        throw error;
      }
    },
    activate() { active = true; },
    dispose() { active = false; cancel(); },
    update(nextSession: string | null | undefined, nextState: AccountState) {
      if (nextSession !== session) cancel();
      session = nextSession;
      state = nextState;
      if (!active) return;
      if (state === "signed-out") cancel();
      else if (state === "ready") settle(true);
    },
    async request() {
      if (!active || state === "signed-out") return false;
      const ticket = generation;
      const ok = await (state === "ready" ? Promise.resolve(true) : new Promise<boolean>((resolve) => waiting.add(resolve)));
      return ok && active && ticket === generation;
    },
  };
}

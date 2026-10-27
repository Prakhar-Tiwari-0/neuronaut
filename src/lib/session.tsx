import { useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { JoinDialog } from "../components/JoinDialog";

export function errorText(e: unknown) {
  return e instanceof ConvexError ? String(e.data) : "Something went wrong. Try again.";
}

type Session = {
  signedIn: boolean;
  me: (typeof api.players.me)["_returnType"] | undefined; // undefined while loading, null without a player
  // Resolves true once the caller is a player. Signed out: opens Clerk's sign-in and resolves false (they act again
  // once signed in). Signed in without a handle: asks for one.
  requireJoin: () => Promise<boolean>;
  signIn: () => void;
  signOut: () => void;
};

const Ctx = createContext<Session | null>(null);

// Sign-in is Clerk; a player is a signed-in user who has picked a handle (players.join).
export function SessionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const clerk = useClerk();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const join = useMutation(api.players.join);
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null);

  // Right after a page load Convex hasn't confirmed the Clerk session yet, and the player row is still loading. A click
  // in that window must wait, not be read as "signed out" (Clerk ignores openSignIn for a signed-in user, so the
  // click would just vanish).
  const now = useRef({ isAuthenticated, me });
  now.current = { isAuthenticated, me };
  const settled = !isLoading && (!isAuthenticated || me !== undefined);
  const waiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (!settled) return;
    waiters.current.forEach((w) => w());
    waiters.current = [];
  }, [settled]);

  const requireJoin = useCallback(async () => {
    if (!settled) await new Promise<void>((r) => waiters.current.push(r));
    const { isAuthenticated, me } = now.current;
    if (me) return true;
    if (!isAuthenticated) {
      clerk.openSignIn();
      return false;
    }
    return new Promise<boolean>((resolve) => setPending(() => resolve));
  }, [settled, clerk]);

  // Ask for a handle as soon as a new user signs in, not on their first action.
  useEffect(() => {
    if (isAuthenticated && me === null) setPending((p: ((ok: boolean) => void) | null) => p ?? (() => {}));
  }, [isAuthenticated, me]);

  const finish = (ok: boolean) => {
    pending?.(ok);
    setPending(null);
  };

  return (
    <Ctx.Provider
      value={{
        signedIn: isAuthenticated,
        me: isAuthenticated ? me : null,
        requireJoin,
        signIn: () => clerk.openSignIn(),
        signOut: () => clerk.signOut(),
      }}
    >
      {children}
      {pending && isAuthenticated && me === null && (
        <JoinDialog
          onJoin={async (handle) => {
            await join({ handle });
            finish(true);
          }}
          onClose={() => finish(false)}
        />
      )}
    </Ctx.Provider>
  );
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

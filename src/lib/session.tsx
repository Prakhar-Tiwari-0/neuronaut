import { useAuth, useClerk } from "@clerk/react";
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
  const { sessionId } = useAuth();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const join = useMutation(api.players.join);
  // Every action waiting on a handle, not just the latest: they all settle together when the dialog closes.
  const joiners = useRef(new Set<(ok: boolean) => void>());
  const [asking, setAsking] = useState(false);

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
    setAsking(true);
    return new Promise<boolean>((resolve) => joiners.current.add(resolve));
  }, [settled, clerk]);

  const finish = useCallback((ok: boolean) => {
    const waiting = [...joiners.current];
    joiners.current.clear();
    setAsking(false);
    waiting.forEach((resolve) => resolve(ok));
  }, []);

  // Ask for a handle as soon as a new user signs in, not on their first action.
  useEffect(() => {
    if (isAuthenticated && me === null) setAsking(true);
  }, [isAuthenticated, me]);

  // Settle actions waiting on a handle from outside the dialog. One effect, checked in this order: a switch to another
  // account drops them (they belong to the account that started them, and its player can appear in the same render),
  // signing out drops them, and a handle picked in another tab releases them.
  const lastSession = useRef(sessionId);
  useEffect(() => {
    const switched = lastSession.current != null && sessionId !== lastSession.current;
    lastSession.current = sessionId;
    if (!joiners.current.size) return;
    if (switched || (settled && !isAuthenticated)) finish(false);
    else if (me) finish(true);
  }, [sessionId, settled, isAuthenticated, me, finish]);

  const signOut = () => {
    finish(false);
    clerk.signOut();
  };

  return (
    <Ctx.Provider
      value={{
        signedIn: isAuthenticated,
        me: isAuthenticated ? me : null,
        requireJoin,
        signIn: () => clerk.openSignIn(),
        signOut,
      }}
    >
      {children}
      {asking && isAuthenticated && me === null && (
        <JoinDialog
          onJoin={async (handle) => {
            await join({ handle });
            finish(true);
          }}
          onClose={() => finish(false)}
          onSignOut={signOut}
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

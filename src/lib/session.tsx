import { useAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { JoinDialog } from "../components/JoinDialog";
import { createAccountSetup } from "./accountSetup";

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
  const { isLoaded, sessionId } = useAuth();
  const clerk = useClerk();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const join = useMutation(api.players.join);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup] = useState(() => createAccountSetup(setSetupOpen, () => clerk.openSignIn()));

  // Right after a page load Convex hasn't confirmed the Clerk session yet, and the player row is still loading. A click
  // in that window must wait, not be read as "signed out" (Clerk ignores openSignIn for a signed-in user, so the
  // click would just vanish).
  useLayoutEffect(() => {
    setup.mount();
    return () => setup.dispose();
  }, [setup]);
  useLayoutEffect(() => {
    setup.update({
      identity: isLoaded ? sessionId ?? null : undefined,
      authenticated: isAuthenticated,
      loading: isLoading,
      player: me === undefined ? undefined : !!me,
    });
  }, [setup, isLoaded, sessionId, isAuthenticated, isLoading, me]);

  const signOut = () => {
    setup.cancel();
    void clerk.signOut();
  };

  return (
    <Ctx.Provider
      value={{
        signedIn: isAuthenticated,
        me: isAuthenticated ? me : null,
        requireJoin: () => setup.request(),
        signIn: () => clerk.openSignIn(),
        signOut,
      }}
    >
      {children}
      {setupOpen && isAuthenticated && me === null && (
        <JoinDialog
          key={sessionId}
          onJoin={(handle) => setup.submit(() => join({ handle }))}
          onClose={() => setup.cancel()}
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

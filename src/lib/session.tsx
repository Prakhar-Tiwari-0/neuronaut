import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { JoinDialog } from "../components/JoinDialog";

const KEY = "neurodex:token"; // the old name, kept so existing players stay signed in
const listeners = new Set<() => void>();

function readToken() {
  return localStorage.getItem(KEY) ?? undefined;
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

function newToken() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function errorText(e: unknown) {
  return e instanceof ConvexError ? String(e.data) : "Something went wrong. Try again.";
}

type Session = {
  token: string | undefined;
  me: (typeof api.players.me)["_returnType"] | undefined;
  // Resolves with the token once the player has a handle (asking for one if needed), or null if they back out.
  requireJoin: () => Promise<string | null>;
};

const Ctx = createContext<Session | null>(null);

// The player lives in localStorage as a random token; the server only stores its hash.
export function SessionProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), readToken);
  const me = useQuery(api.players.me, { token });
  const join = useMutation(api.players.join);
  const [pending, setPending] = useState<((t: string | null) => void) | null>(null);

  const requireJoin = useCallback(() => {
    if (token && me) return Promise.resolve(token);
    return new Promise<string | null>((resolve) => setPending(() => resolve));
  }, [token, me]);

  const submit = async (handle: string) => {
    const t = newToken();
    await join({ handle, token: t });
    setToken(t);
    pending?.(t);
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ token: me ? token : undefined, me, requireJoin }}>
      {children}
      {pending && (
        <JoinDialog
          onJoin={submit}
          onKey={(t) => {
            setToken(t);
            pending(t);
            setPending(null);
          }}
          onClose={() => {
            pending(null);
            setPending(null);
          }}
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

export function storedToken() {
  return readToken();
}

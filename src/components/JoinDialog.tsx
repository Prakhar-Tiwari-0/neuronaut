import { useState } from "react";
import { errorText } from "../lib/session";
import { Button, ErrorLine, Input, Label } from "./ui";

// Asks for a handle the first time a player does something that needs one. A key from another device logs in instead.
export function JoinDialog({ onJoin, onKey, onClose }: { onJoin: (handle: string) => Promise<void>; onKey: (token: string) => void; onClose: () => void }) {
  const [handle, setHandle] = useState("");
  const [key, setKey] = useState("");
  const [useKey, setUseKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setError(null);
    if (useKey) {
      if (key.trim().length < 32) return setError("That key is too short");
      return onKey(key.trim());
    }
    setBusy(true);
    try {
      await onJoin(handle);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onMouseDown={onClose}>
      <form
        className="w-[360px] border border-line-strong bg-bg p-6"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <Label>{useKey ? "Log in with your key" : "New trainer"}</Label>
        <div className="mt-4">
          {useKey ? (
            <Input autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="paste your key" className="w-full font-mono" />
          ) : (
            <Input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" maxLength={16} className="w-full" />
          )}
        </div>
        <div className="mt-2 min-h-4">
          <ErrorLine error={error} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" className="text-xs text-dim hover:text-fg" onClick={() => setUseKey(!useKey)}>
            {useKey ? "Pick a handle instead" : "Have a key?"}
          </button>
          <Button disabled={busy}>{useKey ? "Log in" : "Start"}</Button>
        </div>
      </form>
    </div>
  );
}

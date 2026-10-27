import { useState } from "react";
import { errorText } from "../lib/session";
import { Button, ErrorLine, Input, Label } from "./ui";

// Asks a newly signed-in user for the handle they'll play under.
export function JoinDialog({ onJoin, onClose }: { onJoin: (handle: string) => Promise<void>; onClose: () => void }) {
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setError(null);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onMouseDown={onClose}>
      <form
        className="w-full max-w-[360px] border border-line-strong bg-bg p-6"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <Label>New trainer</Label>
        <p className="mt-2 text-xs text-dim">Pick the handle other players will see. You can't change it later.</p>
        <div className="mt-4">
          <Input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" maxLength={16} className="w-full" />
        </div>
        <div className="mt-2 min-h-4">
          <ErrorLine error={error} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button disabled={busy}>Start</Button>
        </div>
      </form>
    </div>
  );
}

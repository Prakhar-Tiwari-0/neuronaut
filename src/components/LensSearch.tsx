import { useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Input, NeuronLink, Tokens } from "./ui";

// Search every neuron's steer lens (tokens a push makes likely) and logit lens. Free, and the main way to hunt.
export function LensSearch({ onPick, pickLabel = "Use" }: { onPick?: (layer: number, n: number) => void; pickLabel?: string }) {
  const [q, setQ] = useState("");
  const [layer, setLayer] = useState("");
  const dq = useDeferredValue(q.trim());
  const dl = useDeferredValue(layer);
  const results = useQuery(api.neurons.search, dq ? { q: dq, layer: dl === "" ? undefined : Number(dl) } : "skip");
  return (
    <div>
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search lenses: ocean, doctor, pirate…" className="min-w-0 flex-1" aria-label="search lenses" />
        <Input value={layer} onChange={(e) => setLayer(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="layer" className="w-20 text-center font-mono" aria-label="filter layer" />
      </div>
      {!dq && <p className="mt-2 text-sm text-dim">Type a word from the answers. Neurons whose push makes that word more likely show up here.</p>}
      {dq && (
        <div className="mt-2 max-h-[380px] space-y-1 overflow-y-auto">
          {results === undefined ? (
            <div className="py-3 text-sm text-dim">Searching…</div>
          ) : results.length === 0 ? (
            <div className="py-3 text-sm text-dim">No neuron's lens mentions that. Try a simpler word.</div>
          ) : (
            results.map((r) => (
              <div key={`${r.layer}:${r.n}`} className="flex items-start gap-3 rounded-xl bg-card px-3 py-2.5">
                <NeuronLink layer={r.layer} n={r.n} className="mt-0.5 shrink-0" />
                <Tokens tokens={r.steer} className="min-w-0 flex-1 text-dim" />
                {onPick && (
                  <button className="press shrink-0 rounded-lg border-2 border-line-strong px-2.5 py-1 text-sm font-semibold hover:border-fg" onClick={() => onPick(r.layer, r.n)}>
                    {pickLabel}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

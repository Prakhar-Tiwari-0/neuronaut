import { useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Input, Label, NeuronLink, Tokens } from "./ui";

// Search every neuron's steer lens (tokens a push makes likely) and logit lens. Free, and the main way to hunt.
export function LensSearch({ onPick, pickLabel = "use" }: { onPick?: (layer: number, n: number) => void; pickLabel?: string }) {
  const [q, setQ] = useState("");
  const [layer, setLayer] = useState("");
  const dq = useDeferredValue(q.trim());
  const dl = useDeferredValue(layer);
  const results = useQuery(api.neurons.search, dq ? { q: dq, layer: dl === "" ? undefined : Number(dl) } : "skip");
  return (
    <div>
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search lenses: ocean, doctor, pirate..." className="flex-1" />
        <Input value={layer} onChange={(e) => setLayer(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="layer" className="w-16 font-mono" aria-label="filter layer" />
      </div>
      {dq && (
        <div className="mt-2 max-h-[360px] overflow-y-auto border-t border-line">
          {results === undefined ? (
            <div className="py-3 text-xs text-faint">searching</div>
          ) : results.length === 0 ? (
            <div className="py-3 text-xs text-faint">no neuron's lens mentions that</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-faint">
                  <th className="py-1.5 font-normal"><Label className="text-faint">neuron</Label></th>
                  <th className="py-1.5 font-normal"><Label className="text-faint">steer lens</Label></th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={`${r.layer}:${r.n}`} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3"><NeuronLink layer={r.layer} n={r.n} /></td>
                    <td className="py-1.5 text-dim"><Tokens tokens={r.steer} /></td>
                    <td className="py-1.5 text-right">
                      {onPick && (
                        <button className="font-mono text-xs text-dim hover:text-fg" onClick={() => onPick(r.layer, r.n)}>
                          {pickLabel}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

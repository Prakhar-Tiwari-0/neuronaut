import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { LIMITS } from "../../convex/rules";
import { Replies } from "../components/Replies";
import { Button, ErrorLine, Input, Label, NeuronInput, NeuronLink, Steps } from "../components/ui";
import { dexNo } from "../lib/format";
import { useUnlock } from "../lib/notes";
import { errorText, useSession } from "../lib/session";

type Slot = { layer: string; n: string; dose: string };
const empty: Slot = { layer: "", n: "", dose: "0.6" };

// How an experiment came out, in words. additivity: cosine between the joint change and the sum of the two; gain: the
// joint change's size over the sum's. Calibrated on real runs: small doses land near 0.997, a dose of 1.0 near 0.9.
function verdict(additivity: number, gain: number) {
  const size =
    gain < 0.85
      ? " Together they come out weaker than the sum: both push the same way, and the effect saturates."
      : gain > 1.15
        ? " Together they come out stronger than the sum."
        : "";
  if (additivity >= 0.98)
    return { title: "They add up", body: "The pair changes the model's last layer by almost exactly the sum of the two. Up close, the network is nearly linear." + size };
  if (additivity >= 0.9) return { title: "Mostly add up", body: "Close to the sum, bent a little by the layers in between." + size };
  return { title: "They interfere", body: "The layers after the pushes bend the sum into something else." + size };
}

export function Lab() {
  const { me, requireJoin } = useSession();
  const mine = useQuery(api.lab.mine, {});
  const seen = useQuery(api.map.mine, {});
  const overview = useQuery(api.neurons.overview);
  const run = useMutation(api.lab.run);
  const [slots, setSlots] = useState<[Slot, Slot]>([empty, empty]);
  const [error, setError] = useState<string | null>(null);
  useUnlock("combine", !!mine?.some((e) => e.status === "done"));

  const set = (i: 0 | 1, patch: Partial<Slot>) => setSlots((s) => (i === 0 ? [{ ...s[0], ...patch }, s[1]] : [s[0], { ...s[1], ...patch }]));
  const go = async () => {
    setError(null);
    if (!(await requireJoin())) return;
    if (slots.some((s) => s.layer === "" || s.n === "")) return setError("Fill in both neurons");
    const [a, b] = slots.map((s) => ({ layer: Number(s.layer), n: Number(s.n), dose: Number(s.dose) }));
    try {
      await run({ a, b });
    } catch (e) {
      setError(errorText(e));
    }
  };
  const fill = (layer: number, n: number) => set(slots[0].layer === "" ? 0 : 1, { layer: String(layer), n: String(n) });

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="font-pixel text-4xl">LAB</h1>
          <div className="mt-1 h-6 text-dim">Push two neurons at once. Do their effects add up?</div>
        </div>
        <Steps
          steps={[
            <>Pick two neurons, ideally ones you've already seen.</>,
            <>The model reads the same normal replies with each push alone, then both.</>,
            <>See whether the pair does the sum of the two, or something new. {LIMITS.experiments} a day.</>,
          ]}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        <section className="space-y-6">
          {mine === undefined ? null : mine.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-line-strong p-6 text-dim">
              No experiments yet. Try a pair at a small dose, then the same pair at 1.0, then two neurons that push the same word.
            </div>
          ) : (
            mine.map((e) => {
              const v =
                e.additivity === undefined
                  ? null
                  : e.faint
                    ? { title: "Too faint to tell", body: "One of these barely changes anything alone, so there is little to add up and the numbers are mostly noise. Try two stronger neurons." }
                    : verdict(e.additivity, e.gain ?? 1);
              return (
                <article key={e.id} className="rounded-2xl border border-line bg-card p-6">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
                    <NeuronLink layer={e.a.layer} n={e.a.n} /> ×{e.a.dose} <span className="text-dim">+</span>
                    <NeuronLink layer={e.b.layer} n={e.b.n} /> ×{e.b.dose}
                  </div>
                  {e.status === "pending" && <div className="mt-3 text-dim">Running on the GPU…</div>}
                  {e.status === "failed" && <div className="mt-3 text-glitch">The run failed. Try again.</div>}
                  {v && (
                    <>
                      <div className="mt-3 text-2xl font-semibold">{v.title}</div>
                      <p className="text-dim">{v.body}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Metric label="Additivity" value={e.additivity!.toFixed(3)} sub="cosine with the sum" />
                        <Metric label="Size" value={`${e.gain!.toFixed(2)}×`} sub="of the sum" />
                        <Metric label={`Like ${dexNo(e.a.layer, e.a.n)}`} value={e.towardA!.toFixed(2)} sub="cosine" />
                        <Metric label={`Like ${dexNo(e.b.layer, e.b.n)}`} value={e.towardB!.toFixed(2)} sub="cosine" />
                      </div>
                      {e.texts && e.texts.length > 0 && (
                        <div className="mt-5">
                          <Replies prompts={overview?.prompts ?? []} steered={e.texts} steeredLabel="Both pushed" baseline={overview?.baseline} />
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })
          )}
        </section>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <form
            className="rounded-2xl border border-line bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <Label>Your two neurons</Label>
            {([0, 1] as const).map((i) => (
              <div key={i} className="mt-3 flex flex-wrap items-center gap-2">
                <span className="w-5 font-semibold text-dim">{i ? "B" : "A"}</span>
                <NeuronInput layer={slots[i].layer} n={slots[i].n} onLayer={(v) => set(i, { layer: v })} onN={(v) => set(i, { n: v })} />
                <label className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-dim">×</span>
                  <Input value={slots[i].dose} onChange={(e) => set(i, { dose: e.target.value })} className="w-20 text-center font-mono" inputMode="decimal" aria-label={`dose ${i ? "B" : "A"}`} />
                </label>
              </div>
            ))}
            <Button size="lg" className="mt-4 w-full">
              Run
            </Button>
            <div className="mt-2 min-h-5">
              <ErrorLine error={error} />
            </div>
          </form>
          {me && seen && seen.length > 0 && (
            <div>
              <Label className="mb-2">Neurons you've seen</Label>
              <div className="flex flex-wrap gap-2">
                {seen.slice(0, 18).map((s) => (
                  <button key={`${s.layer}:${s.n}`} onClick={() => fill(s.layer, s.n)} className="press rounded-lg bg-raised px-2.5 py-1.5 font-mono text-sm hover:bg-line">
                    {dexNo(s.layer, s.n)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-raised px-3 py-2.5">
      <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-dim">{label}</div>
      <div className="font-mono text-xl tabular-nums">{value}</div>
      <div className="text-xs text-faint">{sub}</div>
    </div>
  );
}

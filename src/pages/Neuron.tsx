import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { MODEL, POINTS } from "../../convex/rules";
import { Replies } from "../components/Replies";
import { Button, ErrorLine, Input, Label, RarityTag, Stat, Tokens } from "../components/ui";
import { dexNo } from "../lib/format";
import { errorText, useSession } from "../lib/session";

export function Neuron() {
  const params = useParams();
  const layer = Number(params.layer);
  const n = Number(params.n);
  const valid = Number.isInteger(layer) && Number.isInteger(n) && layer >= 0 && layer < MODEL.layers && n >= 0 && n < MODEL.width;
  const { me, requireJoin } = useSession();
  const card = useQuery(api.neurons.card, valid ? { layer, n } : "skip");
  const overview = useQuery(api.neurons.overview);
  const scan = useMutation(api.neurons.scan);
  const catchNeuron = useAction(api.neurons.catchNeuron);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [caught, setCaught] = useState<{ points: number; uniqueness: number } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!valid) return <div className="py-20 text-center text-dim">No such neuron.</div>;
  if (card === undefined) return <div className="py-20 text-center text-faint">loading</div>;

  const doScan = async () => {
    setError(null);
    const ok = await requireJoin();
    if (!ok) return;
    try {
      await scan({ layer, n });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const doCatch = async () => {
    setError(null);
    const ok = await requireJoin();
    if (!ok || !card.profile) return;
    setBusy(true);
    try {
      const r = await catchNeuron({ layer, n, name: name.trim() || card.profile.words[0] || dexNo(layer, n) });
      setCaught(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const p = card.profile;
  const prev = n > 0 ? [layer, n - 1] : layer > 0 ? [layer - 1, MODEL.width - 1] : null;
  const next = n < MODEL.width - 1 ? [layer, n + 1] : layer < MODEL.layers - 1 ? [layer + 1, 0] : null;

  return (
    <div className="mx-auto max-w-[920px] space-y-8">
      <div className="flex items-center gap-3 text-sm font-medium text-dim">
        {prev && <Link to={`/n/${prev[0]}/${prev[1]}`} className="rounded-lg px-2 py-1 hover:bg-raised hover:text-fg">&larr; {dexNo(prev[0], prev[1])}</Link>}
        {next && <Link to={`/n/${next[0]}/${next[1]}`} className="ml-auto rounded-lg px-2 py-1 hover:bg-raised hover:text-fg">{dexNo(next[0], next[1])} &rarr;</Link>}
      </div>

      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <h1 className="font-pixel text-5xl">{dexNo(layer, n)}</h1>
          {card.caught && <span className="text-3xl font-semibold">{card.caught.name}</span>}
          {p && <RarityTag rarity={p.rarity} className="mb-2 text-sm" />}
        </div>
        <div className="mt-2 text-dim">
          Layer {layer}, neuron {n}
          {card.caught && (
            <>
              {" "}· caught by{" "}
              <Link to={`/t/${card.caught.handle}`} className="font-semibold text-fg underline underline-offset-4">
                {card.caught.handle}
              </Link>{" "}
              for {card.caught.points} pts
            </>
          )}
        </div>
        <div className="mt-6 grid gap-5 border-t border-line pt-5 md:grid-cols-2">
          <div>
            <Label>Steer lens: words a push makes likely</Label>
            <Tokens tokens={card.steer} className="mt-2 block" />
          </div>
          <div>
            <Label>Logit lens</Label>
            <Tokens tokens={card.lens} className="mt-2 block text-dim" />
          </div>
        </div>
      </div>

      {card.status === "hidden" && (
        <div className="rounded-2xl border-2 border-dashed border-line-strong p-6 text-center">
          <p className="text-lg">What does this neuron do? Scan it to find out.</p>
          <p className="mt-1 text-dim">A scan runs the model with this neuron pushed and shows its answers and rarity.</p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <Button size="lg" onClick={doScan} disabled={!!me && me.scansLeft <= 0}>
              Scan
            </Button>
            {me && <span className="text-sm text-dim">{me.scansLeft} scans left today</span>}
          </div>
          <div className="mt-2"><ErrorLine error={error} /></div>
        </div>
      )}

      {card.status === "pending" && (
        <div className="rounded-2xl border border-line bg-card p-6 text-center text-lg text-dim">Measuring on the GPU. Usually a few seconds.</div>
      )}

      {p && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Strength" value={p.z.toFixed(1)} sub="vs random pushes" />
            <Stat label="Coherence" value={p.nll.toFixed(2)} sub="lower is cleaner" />
            <Stat label="Variety" value={p.distinct.toFixed(2)} sub="1 = no loops" />
            <Stat label="Worth" value={`${POINTS[p.rarity]} pts`} sub="more if unique" />
          </div>
          {p.words.length > 0 && (
            <div>
              <Label>Words it brings up</Label>
              <Tokens tokens={p.words} className="mt-2 block text-base" />
            </div>
          )}

          {!card.caught && !caught && (
            <form
              className="rounded-2xl border-2 border-fg bg-card p-6"
              onSubmit={(e) => {
                e.preventDefault();
                doCatch();
              }}
            >
              <div className="text-xl font-semibold">Catch it</div>
              <p className="mt-1 text-dim">Name it and it's yours. Everyone sees your name on it. Effects unlike anything caught before score more.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={p.words[0] ?? "name"} maxLength={24} className="min-w-0 flex-1 sm:max-w-72" aria-label="name" />
                <Button size="lg" disabled={busy || (!!me && me.catchesLeft <= 0)}>
                  Catch
                </Button>
              </div>
              {me && <div className="mt-2 text-sm text-dim">{me.catchesLeft} catches left today</div>}
              <div className="mt-2"><ErrorLine error={error} /></div>
            </form>
          )}
          {caught && (
            <div className="pop rounded-2xl border-2 border-good bg-card p-6 text-center">
              <div className="font-pixel text-2xl text-good">CAUGHT</div>
              <div className="mt-1 text-lg">
                Caught. +{caught.points} pts
              </div>
              <div className="text-sm text-dim">uniqueness {caught.uniqueness.toFixed(2)}</div>
            </div>
          )}

          <div>
            <Label className="mb-3">What it does: the model's answers with this neuron pushed</Label>
            <Replies prompts={overview?.prompts ?? []} steered={p.texts} baseline={overview?.baseline} />
          </div>
        </>
      )}
    </div>
  );
}

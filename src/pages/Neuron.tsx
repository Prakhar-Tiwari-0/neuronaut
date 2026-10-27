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
    <div className="max-w-[920px]">
      <div className="flex items-center gap-3 font-mono text-xs text-dim">
        {prev && <Link to={`/n/${prev[0]}/${prev[1]}`} className="hover:text-fg">&larr; {dexNo(prev[0], prev[1])}</Link>}
        {next && <Link to={`/n/${next[0]}/${next[1]}`} className="ml-auto hover:text-fg">{dexNo(next[0], next[1])} &rarr;</Link>}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="font-pixel text-4xl">{dexNo(layer, n)}</h1>
        {card.caught && <span className="text-2xl font-medium">{card.caught.name}</span>}
        {p && <RarityTag rarity={p.rarity} className="mb-1.5" />}
      </div>
      <div className="mt-2 font-mono text-xs text-dim">
        layer {layer} · neuron {n}
        {card.caught && (
          <>
            {" "}· caught by{" "}
            <Link to={`/t/${card.caught.handle}`} className="text-fg hover:underline underline-offset-4">
              {card.caught.handle}
            </Link>{" "}
            for {card.caught.points} pts
          </>
        )}
      </div>

      <div className="mt-8 grid gap-6 border-y border-line py-4 md:grid-cols-2">
        <div>
          <Label>Steer lens</Label>
          <Tokens tokens={card.steer} className="mt-1.5 block" />
        </div>
        <div>
          <Label>Logit lens</Label>
          <Tokens tokens={card.lens} className="mt-1.5 block text-dim" />
        </div>
      </div>

      {card.status === "hidden" && (
        <div className="mt-8">
          <p className="text-dim">Its steered behaviour and rarity are hidden until you scan it.</p>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={doScan} disabled={!!me && me.scansLeft <= 0}>
              Scan
            </Button>
            {me && <span className="font-mono text-xs text-dim">{me.scansLeft} scans left today</span>}
          </div>
          <div className="mt-2"><ErrorLine error={error} /></div>
        </div>
      )}

      {card.status === "pending" && <p className="mt-8 text-dim">Measuring on the GPU. Usually a few seconds.</p>}

      {p && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat label="Strength" value={p.z.toFixed(1)} sub="z vs random pushes" />
            <Stat label="Coherence" value={p.nll.toFixed(2)} sub="NLL, lower is cleaner" />
            <Stat label="Variety" value={p.distinct.toFixed(2)} sub="worst reply, 1 = no loops" />
            <Stat label="Worth" value={POINTS[p.rarity]} sub="x (1 + uniqueness)" />
          </div>
          {p.words.length > 0 && (
            <div className="mt-6">
              <Label>Shows up</Label>
              <Tokens tokens={p.words} className="mt-1.5 block" />
            </div>
          )}

          {!card.caught && (
            <form
              className="mt-8 border border-line-strong p-4"
              onSubmit={(e) => {
                e.preventDefault();
                doCatch();
              }}
            >
              <Label>Catch</Label>
              <p className="mt-2 text-xs text-dim">Catching names it for everyone. Unique effects score more.</p>
              <div className="mt-3 flex items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={p.words[0] ?? "name"} maxLength={24} className="w-64" aria-label="name" />
                <Button disabled={busy || (!!me && me.catchesLeft <= 0)}>Catch</Button>
                {me && <span className="font-mono text-xs text-dim">{me.catchesLeft} left today</span>}
              </div>
              <div className="mt-2"><ErrorLine error={error} /></div>
            </form>
          )}
          {caught && (
            <div className="mt-4 font-mono text-sm text-good">
              Caught. +{caught.points} pts (uniqueness {caught.uniqueness.toFixed(2)})
            </div>
          )}

          <div className="mt-8">
            <Label className="mb-2">Pushed at 0.6</Label>
            <Replies prompts={overview?.prompts ?? []} steered={p.texts} baseline={overview?.baseline} />
          </div>
        </>
      )}
    </div>
  );
}

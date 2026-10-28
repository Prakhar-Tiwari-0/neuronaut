import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { EFFECTS, type Effect, MODEL, POINTS, PREDICT_POINTS } from "../../convex/rules";
import { BehaviorMap, ZONES, zoneTint } from "../components/BehaviorMap";
import { Replies } from "../components/Replies";
import { Button, ErrorLine, Input, Label, RarityTag, Stat, Tokens } from "../components/ui";
import { EFFECT_TEXT } from "../lib/effects";
import { dexNo } from "../lib/format";
import { useUnlock } from "../lib/notes";
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

  const effect = card?.effect ?? null;
  useUnlock("lenses", effect === "word");
  useUnlock("early", effect === "shift" && layer < 8);
  useUnlock("breaks", effect === "breaks");
  useUnlock("quiet", effect === "quiet");
  useUnlock("focus", effect !== "breaks" && card?.focus?.n === 4);

  if (!valid) return <div className="py-20 text-center text-dim">No such neuron.</div>;
  if (card === undefined) return <div className="py-20 text-center text-faint">loading</div>;

  const doScan = async (prediction: Effect) => {
    setError(null);
    const ok = await requireJoin();
    if (!ok) return;
    try {
      await scan({ layer, n, prediction });
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
        <div className="rounded-2xl border-2 border-dashed border-line-strong p-6">
          <p className="text-xl font-semibold">Predict, then scan</p>
          <p className="mt-1 text-dim">
            Pushing this neuron will change how the model answers. From its layer ({layer} of {MODEL.layers - 1}) and its two
            lenses above, what do you expect? Your pick spends a scan, and a right call is worth {PREDICT_POINTS} pts.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {EFFECTS.map((e) => (
              <button
                key={e}
                onClick={() => doScan(e)}
                disabled={!!me && me.scansLeft <= 0}
                className="press rounded-xl border-2 border-line-strong bg-card p-4 text-left hover:border-fg disabled:pointer-events-none disabled:opacity-40"
              >
                <div className="font-semibold">{EFFECT_TEXT[e].name}</div>
                <div className="text-sm text-dim">{EFFECT_TEXT[e].looks}</div>
              </button>
            ))}
          </div>
          {me && <div className="mt-3 text-sm text-dim">{me.scansLeft} scans left today</div>}
          <div className="mt-2"><ErrorLine error={error} /></div>
        </div>
      )}

      {effect && <Effects card={card} />}

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

type Card = NonNullable<(typeof api.neurons.card)["_returnType"]>;

// What pushing it does, how focused that is and where it sits on the map, with the player's prediction if they made one.
function Effects({ card }: { card: Card }) {
  const effect = card.effect!;
  const zone = card.place ? ZONES.find((z) => z.id === card.place!.zone) : null;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
      <div className="space-y-4 rounded-2xl border border-line bg-card p-6">
        {card.prediction && (
          <div className={`pop rounded-xl px-4 py-3 font-medium ${card.prediction.right ? "bg-good/15 text-fg" : "bg-raised"}`}>
            {card.prediction.right
              ? `You called it: ${EFFECT_TEXT[card.prediction.said].name.toLowerCase()}. +${PREDICT_POINTS} pts`
              : `You said ${EFFECT_TEXT[card.prediction.said].name.toLowerCase()}.`}
          </div>
        )}
        <div>
          <Label>What pushing it does</Label>
          <div className="mt-1 text-2xl font-semibold">{EFFECT_TEXT[effect].name}</div>
          <div className="text-dim">{EFFECT_TEXT[effect].looks}</div>
        </div>
        {card.focus && effect !== "breaks" && (
          <div>
            <Label>Focus</Label>
            <div className="mt-1">
              {card.focus.word ? (
                <>
                  <span className="font-mono font-semibold">{card.focus.word}</span> comes up in{" "}
                  <span className="font-semibold">
                    {card.focus.n} of {card.focus.of}
                  </span>{" "}
                  replies. {card.focus.n === 4 ? "Same theme whatever the question." : card.focus.n <= 1 ? "What it brings up depends on the question." : ""}
                </>
              ) : (
                "No word repeats across its replies: what it brings up depends on the question."
              )}
            </div>
          </div>
        )}
        {zone && (
          <div>
            <Label>Zone</Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: zoneTint(zone.id) }} />
              <span className="font-semibold">{zone.name}</span>
            </div>
            <div className="text-dim">{zone.blurb}</div>
          </div>
        )}
      </div>
      {card.place && (
        <Link to="/map" className="block rounded-2xl border border-line bg-card p-3 hover:border-line-strong" aria-label="Open the map">
          <BehaviorMap labels={false} dots={[{ layer: card.layer, n: card.n, x: card.place.x, y: card.place.y, color: "--fg", size: 5 }]} />
        </Link>
      )}
    </div>
  );
}

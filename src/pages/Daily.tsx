import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LADDER_EXACT } from "../../convex/rules";
import { BehaviorMap, type Dot } from "../components/BehaviorMap";
import { LensSearch } from "../components/LensSearch";
import { Replies } from "../components/Replies";
import { Button, ErrorLine, HeatBar, Label, Modal, NeuronInput, NeuronLink, Steps } from "../components/ui";
import { dexNo, heatBg, heatEmoji, heatVar, rankText } from "../lib/format";
import { useUnlock } from "../lib/notes";
import { errorText, useSession } from "../lib/session";

type Daily = NonNullable<(typeof api.daily.current)["_returnType"]>;

function shareText(d: Daily) {
  const r = d.result!;
  const sq = r.heats.map((h, i) => heatEmoji(h, r.solved && i === r.heats.length - 1)).join("");
  return `Neuronaut #${d.number}${r.practice ? " (practice)" : ""} ${r.solved ? r.guesses : "X"}/${d.limit}\n${sq}\n${location.origin}/daily`;
}

// Time until the next puzzle (00:00 UTC), ticking once a second while the result card is open.
function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next.getTime() - now) / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
}

function ResultCard({ d, onClose }: { d: Daily; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown();
  const { me } = useSession();
  const r = d.result!;
  return (
    <div className="text-center">
      <div className={`pop font-pixel text-3xl ${r.solved ? "text-good" : "text-hot"}`}>
        {r.solved ? "SOLVED" : "OUT OF GUESSES"}
      </div>
      <p className="mt-2 text-lg">{r.solved ? `Solved in ${r.guesses}` : "The neuron got away."}</p>
      <div className="mt-1 text-dim">
        The neuron was <NeuronLink layer={d.answer!.layer} n={d.answer!.n} className="text-base text-fg" />
      </div>
      <div className="stagger mt-5 flex flex-wrap justify-center gap-1.5 text-2xl" aria-label="your guesses">
        {r.heats.map((h, i) => (
          <span key={i} style={{ ["--i" as string]: i }}>
            {heatEmoji(h, r.solved && i === r.heats.length - 1)}
          </span>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-raised py-3">
          <div className="font-mono text-2xl tabular-nums">{d.solvers}</div>
          <div className="text-xs text-dim">{d.practice ? "solved that day" : "solved today"}</div>
        </div>
        <div className="rounded-xl bg-raised py-3">
          <div className="font-mono text-2xl tabular-nums">{d.practice ? "-" : (me?.streak ?? 0)}</div>
          <div className="text-xs text-dim">{d.practice ? "practice, no streak" : "your streak"}</div>
        </div>
        <div className="rounded-xl bg-raised py-3">
          <div className="font-mono text-2xl tabular-nums">{countdown}</div>
          <div className="text-xs text-dim">next neuron</div>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <Button
          size="lg"
          className="flex-1"
          onClick={() => {
            navigator.clipboard.writeText(shareText(d));
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Share"}
        </Button>
        <Button size="lg" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// One square per guess allowed, Wordle-style: scored guesses in the order made, colored by heat; the rest empty.
function Slots({ d }: { d: Daily }) {
  const inOrder = [...d.guesses].sort((a, b) => a.at - b.at);
  return (
    <div className="mt-3 flex gap-1" aria-label={`${d.guesses.length} of ${d.limit} guesses used`}>
      {Array.from({ length: d.limit }, (_, i) => {
        const g = inOrder[i];
        const fill = !g
          ? "border-2 border-line-strong"
          : g.status === "pending"
            ? "bg-line-strong"
            : heatBg(g.heat, g.correct);
        return <span key={i} className={`h-3 flex-1 rounded-sm ${fill}`} />;
      })}
    </div>
  );
}

function Hint({
  label,
  value,
  unlockAt,
  used,
}: {
  label: string;
  value: string | null;
  unlockAt: number;
  used: number;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${value ? "border-line-strong bg-card" : "border-dashed border-line-strong"}`}
    >
      <span className="text-sm text-dim">{label}</span>
      {value ? (
        <span className="pop font-mono font-medium">{value}</span>
      ) : (
        <span className="text-sm text-faint">unlocks in {unlockAt - used} guesses</span>
      )}
    </div>
  );
}

// After a puzzle: the answer's replies next to one guess's replies on the same profile prompts, so a player can see
// what heat measured. Both cards are visible by then (the player guessed one, and finishing reveals the answer).
function WhyHeat({ d, pick, onPick }: { d: Daily; pick: string | null; onPick: (k: string) => void }) {
  const wrong = d.guesses.filter((g) => !g.correct && g.status === "done");
  const g = wrong.find((x) => `${x.layer}:${x.n}` === pick) ?? wrong[0];
  const overview = useQuery(api.neurons.overview);
  const answer = useQuery(api.neurons.card, { layer: d.answer!.layer, n: d.answer!.n });
  const guessed = useQuery(api.neurons.card, g ? { layer: g.layer, n: g.n } : "skip");
  if (!g) return null;
  return (
    <section>
      <Label className="mb-2">Why each guess scored what it did</Label>
      <p className="mb-4 max-w-[62ch] text-dim">
        Heat compares what two neurons do, not their numbers. Here is the answer next to one of your guesses on the same four
        questions. The closer they read, the higher the cosine between their behavior embeddings.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {wrong.map((x) => {
          const k = `${x.layer}:${x.n}`;
          return (
            <button
              key={k}
              onClick={() => onPick(k)}
              className={`press rounded-lg px-3 py-1.5 font-mono text-sm ${x === g ? "bg-accent text-accent-fg" : "bg-raised hover:bg-line"}`}
            >
              {dexNo(x.layer, x.n)} · {x.cos?.toFixed(2)}
            </button>
          );
        })}
      </div>
      {answer?.profile && guessed?.profile ? (
        <Replies
          prompts={overview?.prompts ?? []}
          steered={answer.profile.texts}
          steeredLabel={`The answer, ${dexNo(d.answer!.layer, d.answer!.n)}`}
          baseline={guessed.profile.texts}
          baselineLabel={`Your guess ${dexNo(g.layer, g.n)}: cosine ${g.cos?.toFixed(2)}, heat ${g.heat}`}
        />
      ) : (
        <div className="rounded-2xl border border-line bg-card p-5 text-dim">Loading the answer's replies…</div>
      )}
    </section>
  );
}

// The player's guesses on the behavior map, colored by heat; the answer as a green ring once the puzzle is over.
// Quiet guesses (no place) don't show.
function GuessMap({ d }: { d: Daily }) {
  const dots: Dot[] = d.guesses.flatMap((g) => (g.place ? [{ layer: g.layer, n: g.n, ...g.place, color: heatVar(g.heat, g.correct), label: g.heat === null ? "" : `heat ${g.heat}` }] : []));
  if (d.answer?.place) dots.push({ layer: d.answer.layer, n: d.answer.n, ...d.answer.place, color: "--good", ring: true, size: 7, label: "the answer" });
  return (
    <div>
      <Label className="mb-2">Your guesses on the map</Label>
      <div className="rounded-2xl border border-line bg-card p-3">
        <BehaviorMap dots={dots} labels={false} />
      </div>
      <p className="mt-2 text-sm text-dim">
        Neurons that act alike sit close together, so hot guesses tend to bunch up. The map is a squashed view: trust heat over distance.
      </p>
    </div>
  );
}

// Past puzzles to replay for practice, newest first.
function Archive({ current }: { current: string }) {
  const past = useQuery(api.daily.archive, {});
  if (!past?.length) return null;
  return (
    <section>
      <Label className="mb-2">Practice: past puzzles</Label>
      <p className="mb-4 text-dim">Same scoring, no points and no streak. Mondays are easiest, weekends hardest.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {past.map((p) => (
          <Link
            key={p.date}
            to={`/daily/${p.date}`}
            className={`press flex items-center justify-between rounded-xl border px-4 py-3 hover:border-line-strong ${p.date === current ? "border-fg bg-card" : "border-line bg-card"}`}
          >
            <span>
              <span className="font-pixel">#{p.number}</span>
              <span className="ml-2 text-sm text-dim">{p.difficulty ?? ""}</span>
            </span>
            <span className="text-sm text-dim">
              {p.mine ? (p.mine.solved ? `solved in ${p.mine.guesses}` : "missed") : p.players ? `${p.solvers}/${p.players} solved` : "unplayed"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Daily() {
  const { requireJoin } = useSession();
  const { date } = useParams();
  const d = useQuery(api.daily.current, date ? { date } : {});
  const guess = useMutation(api.daily.guess);
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [layer, setLayer] = useState("");
  const [n, setN] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showNormal, setShowNormal] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);

  useUnlock("heat", !!d?.guesses.some((g) => g.status === "done"));

  // open the result card once, the first time a player sees this puzzle finished
  const finished = !!d?.result;
  useEffect(() => {
    if (!d || !finished) return;
    const key = `neuronaut:result:${d.date}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "1");
      setResultOpen(true);
    }
  }, [d, finished]);

  const submit = async () => {
    setError(null);
    const ok = await requireJoin();
    if (!ok) return;
    const fail = (msg: string) => {
      setError(msg);
      setShaking(true);
    };
    if (layer === "" || n === "") return fail("Enter a layer and a neuron number");
    try {
      await guess({ layer: Number(layer), n: Number(n), ...(date ? { date } : {}) });
      setN("");
    } catch (e) {
      fail(errorText(e));
    }
  };

  // The header and directions don't wait for the puzzle, so the page paints at once.
  const header = (
    <div className="space-y-5">
      <div>
        <h1 className="font-pixel text-4xl">
          {date ? "PRACTICE" : "DAILY"}
          {d ? ` #${d.number}` : ""}
        </h1>
        {/* always rendered, so the line's arrival doesn't push the page down */}
        <div className="mt-1 h-6 text-dim">
          {d ? [d.date, d.difficulty, `${d.solvers} of ${d.players} solved`, d.practice && "no points, no streak"].filter(Boolean).join(" · ") : "\u00a0"}
        </div>
      </div>
      <Steps
        steps={[
          <>Read how the hidden neuron changed the model's answers.</>,
          <>Search for words you see. That lists neurons likely to cause them.</>,
          <>Guess. The hotter the bar, the closer you are.</>,
        ]}
      />
    </div>
  );

  if (d === undefined)
    return (
      <div className="space-y-8">
        {header}
        <div className="py-10 text-center text-dim">Loading today's neuron…</div>
      </div>
    );
  if (d === null)
    return (
      <div className="space-y-8">
        {header}
        <div className="py-10 text-center text-dim">
          Today's neuron is still being picked. Check back in a few minutes.
        </div>
      </div>
    );

  const used = d.guesses.length;
  const latest = [...d.guesses].sort((a, b) => b.at - a.at)[0];

  return (
    <div className="space-y-8">
      {header}
      <div className="grid gap-8 lg:grid-cols-[1fr_440px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <Label>The clues</Label>
            <button
              className="text-sm font-medium text-dim underline underline-offset-4 hover:text-fg"
              onClick={() => setShowNormal(!showNormal)}
            >
              {showNormal ? "Hide normal answers" : "Compare with normal answers"}
            </button>
          </div>
          <div className="space-y-4">
            {d.prompts.map((p, i) => (
              <div key={i} className="rounded-2xl border border-line bg-card p-5">
                <div className="text-[15px] font-semibold">{p}</div>
                <div className="screen mt-3 text-fg">{d.texts[i] || "(silence)"}</div>
                {showNormal && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Normal answer</div>
                    <div className="screen text-dim">{d.baseline[i]}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {finished ? (
            <div className="pop rounded-2xl border-2 border-good bg-card p-5 text-center">
              <div className="text-lg font-semibold">
                {d.result!.solved ? `Solved in ${d.result!.guesses}` : "Out of guesses"}
              </div>
              <div className="mt-1 text-dim">
                It was <NeuronLink layer={d.answer!.layer} n={d.answer!.n} className="text-base text-fg" />
              </div>
              <Button className="mt-4 w-full" onClick={() => setResultOpen(true)}>
                See result and share
              </Button>
            </div>
          ) : (
            <form
              className="rounded-2xl border border-line bg-card p-5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="flex items-baseline justify-between">
                <Label>Your guess</Label>
                <span className="font-mono text-sm tabular-nums text-dim">
                  {used}/{d.limit}
                </span>
              </div>
              <div
                className={`mt-3 flex flex-wrap items-center gap-2 ${shaking ? "shake" : ""}`}
                onAnimationEnd={() => setShaking(false)}
              >
                <NeuronInput layer={layer} n={n} onLayer={setLayer} onN={setN} />
                <Button className="flex-1">Guess</Button>
              </div>
              <div className="mt-2 min-h-5">
                <ErrorLine error={error} />
              </div>
              <Slots d={d} />
            </form>
          )}

          {!finished && (
            <div>
              <Label className="mb-2">Find neurons by word</Label>
              <LensSearch
                pickLabel="Guess this"
                onPick={(l, nn) => {
                  setLayer(String(l));
                  setN(String(nn));
                  setError(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          )}
          {used > 0 && (
            <div>
              <Label className="mb-2">Guesses, hottest first</Label>
              <div className="space-y-1.5">
                {d.guesses.map((g) => {
                  const k = `${g.layer}:${g.n}`;
                  return (
                    <div key={k} data-guess className={`rounded-xl bg-card ${g === latest ? "ring-2 ring-fg" : ""}`}>
                      <button
                        type="button"
                        onClick={() => setOpen(open === k ? null : k)}
                        aria-expanded={open === k}
                        className="grid w-full grid-cols-[5.5rem_1fr_3rem_4rem] items-center gap-3 px-3 py-2.5 text-left"
                      >
                        <span className="font-pixel text-sm">{dexNo(g.layer, g.n)}</span>
                        {g.status === "pending" ? (
                          <span className="text-sm text-faint">measuring…</span>
                        ) : (
                          <HeatBar heat={g.heat} correct={g.correct} />
                        )}
                        <span className="text-right font-mono font-semibold tabular-nums">
                          {g.status === "pending" ? "" : g.correct ? "hit" : g.heat}
                        </span>
                        <span className="text-right font-mono text-sm tabular-nums text-dim">
                          {g.status === "pending" || g.rank === null ? "" : g.correct ? "" : rankText(g.rank)}
                        </span>
                      </button>
                      {open === k && g.status === "done" && (
                        <div className="border-t border-line px-3 py-2.5 text-sm text-dim">
                          {g.correct ? (
                            "Its effect matches the answer's."
                          ) : (
                            <>
                              Behavior cosine <span className="font-mono text-fg">{g.cos?.toFixed(3) ?? "?"}</span> to the answer.{" "}
                              {g.rank !== null && `${g.rank > LADDER_EXACT ? "About " : ""}${(g.rank - 1).toLocaleString()} act more like the answer.`}{" "}
                            </>
                          )}
                          <NeuronLink layer={g.layer} n={g.n} className="ml-1" /> <span className="text-faint">open card</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {d.guesses.some((g) => g.place) && <GuessMap d={d} />}

          {!finished && (
            <div className="space-y-2">
              <Label>Hints</Label>
              <Hint
                label="Layer range"
                value={d.band ? `L${d.band[0]} to L${d.band[1]}` : null}
                unlockAt={d.hintsAt.band}
                used={used}
              />
              <Hint label="A word it pushes" value={d.hint} unlockAt={d.hintsAt.token} used={used} />
            </div>
          )}
        </aside>
      </div>

      {finished && d.answer && <WhyHeat d={d} pick={pick} onPick={setPick} />}
      <Archive current={d.date} />

      <Modal open={resultOpen} onClose={() => setResultOpen(false)} label="Today's result">
        <ResultCard d={d} onClose={() => setResultOpen(false)} />
      </Modal>
    </div>
  );
}

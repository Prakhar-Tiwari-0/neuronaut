import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { LensSearch } from "../components/LensSearch";
import { Replies } from "../components/Replies";
import { Button, ErrorLine, HeatBar, Label, NeuronInput, NeuronLink } from "../components/ui";
import { heatColor, rankText } from "../lib/format";
import { errorText, useSession } from "../lib/session";

function shareText(number: number, guesses: number, limit: number, solved: boolean, heats: number[]) {
  const sq = heats.map((h, i) => (solved && i === heats.length - 1 ? "🟩" : h >= 70 ? "🟥" : h >= 45 ? "🟧" : h >= 20 ? "🟨" : "⬛")).join("");
  return `NEURONAUT daily #${number} ${solved ? guesses : "X"}/${limit}\n${sq}\n${location.origin}/daily`;
}

export function Daily() {
  const { token, requireJoin } = useSession();
  const d = useQuery(api.daily.current, { token });
  const guess = useMutation(api.daily.guess);
  const [layer, setLayer] = useState("");
  const [n, setN] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (d === undefined) return <div className="py-20 text-center text-faint">loading</div>;
  if (d === null) return <div className="py-20 text-center text-dim">Today's neuron is still being picked. Check back soon.</div>;

  const finished = !!d.result;
  const submit = async () => {
    setError(null);
    const t = await requireJoin();
    if (!t) return;
    if (layer === "" || n === "") return setError("Enter a layer and a neuron");
    try {
      await guess({ token: t, layer: Number(layer), n: Number(n) });
      setN("");
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
      <section>
        <div className="flex items-baseline gap-4">
          <h1 className="font-pixel text-3xl">DAILY #{d.number}</h1>
          <span className="font-mono text-xs text-dim">{d.date}</span>
          <span className="ml-auto font-mono text-xs text-dim">
            {d.solvers}/{d.players} solved
          </span>
        </div>
        <p className="mt-3 max-w-[60ch] text-dim">
          One neuron was pushed while the model answered these. Find it: any of 294,912. Each guess tells you how close its
          effect is to the hidden one.
        </p>
        <div className="mt-6">
          <Replies prompts={d.prompts} steered={d.texts} baseline={d.baseline} steeredLabel="hidden neuron pushed" />
        </div>
      </section>

      <aside className="space-y-8 lg:sticky lg:top-16 lg:self-start">
        {finished ? (
          <div className="border border-line-strong p-4">
            <Label className={d.result!.solved ? "text-good" : "text-glitch"}>{d.result!.solved ? `Solved in ${d.result!.guesses}` : "Out of guesses"}</Label>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-dim">The neuron was</span>
              <NeuronLink layer={d.answer!.layer} n={d.answer!.n} className="text-lg" />
            </div>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => {
                navigator.clipboard.writeText(shareText(d.number, d.result!.guesses, d.limit, d.result!.solved, d.result!.heats));
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Share result"}
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center justify-between">
              <Label>Guess</Label>
              <span className="font-mono text-xs text-dim">
                {d.guesses.length}/{d.limit}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <NeuronInput layer={layer} n={n} onLayer={setLayer} onN={setN} />
              <Button>Guess</Button>
            </div>
            <div className="mt-1.5 min-h-4">
              <ErrorLine error={error} />
            </div>
          </form>
        )}

        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-dim">layer band</span>
            {d.band ? <span>L{d.band[0]} to L{d.band[1]}</span> : <span className="text-faint">after {d.hintsAt.band} guesses</span>}
          </div>
          <div className="flex justify-between">
            <span className="text-dim">top steer token</span>
            {d.hint ? <span>{d.hint}</span> : <span className="text-faint">after {d.hintsAt.token} guesses</span>}
          </div>
        </div>

        {d.guesses.length > 0 && (
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-left">
                <th className="pb-1.5 font-normal"><Label className="text-faint">neuron</Label></th>
                <th className="pb-1.5 font-normal"><Label className="text-faint">heat</Label></th>
                <th className="pb-1.5 text-right font-normal"><Label className="text-faint">rank</Label></th>
              </tr>
            </thead>
            <tbody>
              {d.guesses.map((g) => (
                <tr key={`${g.layer}:${g.n}`} className="border-t border-line">
                  <td className="py-1.5"><NeuronLink layer={g.layer} n={g.n} /></td>
                  <td className="py-1.5">
                    {g.status === "pending" ? (
                      <span className="text-faint">measuring</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <HeatBar heat={g.heat} correct={g.correct} />
                        <span className={heatColor(g.heat, g.correct)}>{g.correct ? "hit" : g.heat}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-dim">{g.status === "pending" || g.rank === null ? "" : g.correct ? "hit" : rankText(g.rank)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!finished && (
          <div>
            <Label className="mb-2">Hunt</Label>
            <LensSearch
              pickLabel="guess this"
              onPick={(l, nn) => {
                setLayer(String(l));
                setN(String(nn));
                setError(null);
                window.scrollTo({ top: 0 });
              }}
            />
          </div>
        )}
      </aside>
    </div>
  );
}

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LensSearch } from "../components/LensSearch";
import { Button, ErrorLine, Input, Label, NeuronInput, NeuronLink } from "../components/ui";
import { until } from "../lib/format";
import { errorText, useSession } from "../lib/session";

export function Bounties() {
  const list = useQuery(api.bounties.list);
  if (list === undefined) return <div className="py-20 text-center text-faint">loading</div>;
  const groups = (["open", "upcoming", "closed"] as const).map((s) => [s, list.filter((b) => b.state === s)] as const);
  return (
    <div>
      <h1 className="font-pixel text-3xl">BOUNTIES</h1>
      <p className="mt-3 max-w-[64ch] text-dim">
        Steer the model toward a target with the neurons you find. The judge runs your push on prompts you never see and scores
        how far the replies move toward the target while staying coherent. Smaller doses score more. Beat par, take the top
        three.
      </p>
      {groups.map(([state, bs]) =>
        bs.length ? (
          <section key={state} className="mt-10">
            <Label className="mb-2">{state}</Label>
            <div className="border-t border-line">
              {bs.map((b) => (
                <Link key={b.slug} to={`/b/${b.slug}`} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-line py-3 hover:bg-raised md:grid-cols-[180px_1fr_90px_80px_90px]">
                  <span className="font-medium">{b.title}</span>
                  <span className="hidden truncate text-dim md:block">{b.brief}</span>
                  <span className="font-mono text-xs text-dim">{b.maxNeurons === 1 ? "1 neuron" : `${b.maxNeurons} neurons`}</span>
                  <span className="text-right font-mono text-xs md:text-left">{b.par === null ? <span className="text-faint">par ?</span> : `par ${Math.round(b.par)}`}</span>
                  <span className="col-start-2 row-start-1 text-right font-mono text-xs text-dim md:col-start-auto md:row-start-auto">
                    {state === "open" ? `${until(b.endsAt)} left` : state === "upcoming" ? `in ${until(b.startsAt)}` : "closed"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

type Row = { layer: string; n: string; dose: string };

export function Bounty() {
  const { slug = "" } = useParams();
  const { requireJoin } = useSession();
  const b = useQuery(api.bounties.get, { slug });
  const submit = useMutation(api.bounties.submit);
  const [rows, setRows] = useState<Row[]>([{ layer: "", n: "", dose: "0.5" }]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(0);

  if (b === undefined) return <div className="py-20 text-center text-faint">loading</div>;
  if (b === null) return <div className="py-20 text-center text-dim">No such bounty.</div>;

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const go = async () => {
    setError(null);
    const ok = await requireJoin();
    if (!ok) return;
    const pushes = rows.filter((r) => r.layer !== "" || r.n !== "");
    if (!pushes.length || pushes.some((r) => r.layer === "" || r.n === "")) return setError("Fill in each neuron's layer and number");
    try {
      await submit({ slug, pushes: pushes.map((r) => ({ layer: Number(r.layer), n: Number(r.n), dose: Number(r.dose) })) });
      setOpen(0);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
      <section>
        <div className="flex items-baseline gap-4">
          <h1 className="text-3xl font-medium tracking-tight">{b.title}</h1>
          <span className="ml-auto font-mono text-xs text-dim">
            {b.state === "open" ? `${until(b.endsAt)} left` : b.state === "upcoming" ? `opens in ${until(b.startsAt)}` : "closed"}
          </span>
        </div>
        <p className="mt-3 max-w-[60ch] text-[15px]">{b.brief}</p>
        <div className="mt-4 flex gap-8 font-mono text-xs text-dim">
          <span>up to <span className="text-fg">{b.maxNeurons}</span> {b.maxNeurons === 1 ? "neuron" : "neurons"}</span>
          <span>par <span className="text-fg">{b.par === null ? "being set" : Math.round(b.par)}</span></span>
          <span>score = 1000 × concept × coherence × efficiency</span>
        </div>

        <div className="mt-10">
          <Label className="mb-2">Leaderboard</Label>
          {b.leaderboard.length === 0 ? (
            <div className="text-dim">No scored entries yet.</div>
          ) : (
            <table className="w-full text-left font-mono text-xs">
              <tbody>
                {b.leaderboard.map((e, i) => (
                  <tr key={i} className={`border-t border-line align-top ${e.you ? "text-fg" : ""}`}>
                    <td className="w-8 py-2 text-faint">{i + 1}</td>
                    <td className="py-2">
                      <Link to={`/t/${e.handle}`} className="hover:underline underline-offset-4">{e.handle}</Link>
                      {e.you && <span className="ml-2 text-faint">you</span>}
                      {e.pushes && (
                        <div className="mt-1 text-dim">
                          {e.pushes.map((p) => (
                            <span key={`${p.layer}:${p.n}`} className="mr-3">
                              <NeuronLink layer={p.layer} n={p.n} className="text-[11px]" /> ×{p.dose}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="w-20 py-2 text-dim">{e.neurons} {e.neurons === 1 ? "neuron" : "neurons"}</td>
                    <td className={`w-16 py-2 text-right ${b.par !== null && e.score > b.par ? "text-good" : ""}`}>{Math.round(e.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {b.state !== "closed" && b.leaderboard.length > 0 && <p className="mt-2 text-xs text-faint">Neurons stay secret until the bounty closes.</p>}
        </div>

        {b.mine.length > 0 && (
          <div className="mt-10">
            <Label className="mb-2">Your entries</Label>
            <div className="border-t border-line">
              {b.mine.map((e, i) => (
                <div key={i} className="border-b border-line py-2">
                  <button className="flex w-full items-baseline gap-4 text-left font-mono text-xs" onClick={() => setOpen(open === i ? null : i)}>
                    <span className="flex-1">
                      {e.pushes.map((p) => (
                        <span key={`${p.layer}:${p.n}`} className="mr-3">
                          L{p.layer} N{p.n} ×{p.dose}
                        </span>
                      ))}
                    </span>
                    {e.status === "done" ? (
                      <>
                        <span className="text-dim">concept {e.concept?.toFixed(2)}</span>
                        <span className="text-dim">coherence {e.coherence?.toFixed(2)}</span>
                        <span className="w-12 text-right text-fg">{Math.round(e.score ?? 0)}</span>
                      </>
                    ) : (
                      <span className={e.status === "failed" ? "text-glitch" : "text-faint"}>{e.status === "failed" ? "failed" : "judging"}</span>
                    )}
                  </button>
                  {open === i && e.texts.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {e.texts.map((t, j) => (
                        <div key={j} className="screen border-l border-line-strong pl-3 text-dim">{t || "(silence)"}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="space-y-8 lg:sticky lg:top-16 lg:self-start">
        {b.state === "open" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <div className="flex items-center justify-between">
              <Label>Enter</Label>
              <span className="font-mono text-xs text-dim">{b.entriesLeft} entries left</span>
            </div>
            <div className="mt-2 space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <NeuronInput layer={r.layer} n={r.n} onLayer={(v) => setRow(i, { layer: v })} onN={(v) => setRow(i, { n: v })} />
                  <span className="font-mono text-xs text-faint">×</span>
                  <Input value={r.dose} onChange={(e) => setRow(i, { dose: e.target.value })} className="w-16 font-mono" inputMode="decimal" aria-label="dose" />
                  {rows.length > 1 && (
                    <button type="button" className="font-mono text-xs text-faint hover:text-fg" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button disabled={b.entriesLeft <= 0}>Submit</Button>
              {rows.length < b.maxNeurons && (
                <Button type="button" variant="ghost" onClick={() => setRows([...rows, { layer: "", n: "", dose: "0.5" }])}>
                  Add neuron
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-faint">Dose: 0.05 to 1, negative pushes the other way. Total dose over 0.5 costs efficiency.</p>
            <div className="mt-1.5 min-h-4"><ErrorLine error={error} /></div>
          </form>
        ) : (
          <div className="text-dim">{b.state === "upcoming" ? "Not open yet." : "This bounty is closed."}</div>
        )}
        <div>
          <Label className="mb-2">Hunt</Label>
          <LensSearch
            pickLabel="add"
            onPick={(l, nn) => {
              const i = rows.findIndex((r) => r.layer === "" && r.n === "");
              if (i >= 0) setRow(i, { layer: String(l), n: String(nn) });
              else if (rows.length < b.maxNeurons) setRows([...rows, { layer: String(l), n: String(nn), dose: "0.5" }]);
              else setRow(rows.length - 1, { layer: String(l), n: String(nn) });
            }}
          />
        </div>
      </aside>
    </div>
  );
}

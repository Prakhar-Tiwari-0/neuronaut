import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { MODEL, RARITIES, type Rarity } from "../../convex/rules";
import { Coverage } from "../components/Coverage";
import { LensSearch } from "../components/LensSearch";
import { Button, ErrorLine, Label, NeuronInput, NeuronLink, RarityTag, Tokens } from "../components/ui";
import { ago, RARITY_COLOR } from "../lib/format";
import { errorText, useSession } from "../lib/session";

const BINS = 96;

export function Dex() {
  const { token, me, requireJoin } = useSession();
  const nav = useNavigate();
  const overview = useQuery(api.neurons.overview);
  const scan = useMutation(api.neurons.scan);
  const [tab, setTab] = useState<"caught" | "seen">("caught");
  const [rarity, setRarity] = useState<Rarity | undefined>(undefined);
  const [layer, setLayer] = useState("");
  const [n, setN] = useState("");
  const [error, setError] = useState<string | null>(null);

  const doScan = async (random: boolean) => {
    setError(null);
    const t = await requireJoin();
    if (!t) return;
    if (!random && (layer === "" || n === "")) return setError("Enter a layer and a neuron, or scan a random one");
    try {
      const r = await scan(random ? { token: t } : { token: t, layer: Number(layer), n: Number(n) });
      nav(`/n/${r.layer}/${r.n}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="space-y-10">
      <section className="grid gap-10 lg:grid-cols-[1fr_400px]">
        <div>
          <h1 className="font-pixel text-3xl">DEX</h1>
          <div className="mt-3 flex gap-8 font-mono text-xs text-dim">
            <span>
              caught <span className="text-fg">{overview?.caught ?? 0}</span> / {(overview?.total ?? 0).toLocaleString()}
            </span>
            <span>
              measured <span className="text-fg">{(overview?.profiled ?? 0).toLocaleString()}</span>
            </span>
          </div>
          <div className="mt-6 overflow-x-auto">
            <Coverage coverage={overview?.coverage ?? []} layers={MODEL.layers} bins={BINS} />
          </div>
        </div>
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doScan(false);
            }}
          >
            <div className="flex items-center justify-between">
              <Label>Scan</Label>
              {me && <span className="font-mono text-xs text-dim">{me.scansLeft} left today</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <NeuronInput layer={layer} n={n} onLayer={setLayer} onN={setN} />
              <Button>Scan</Button>
              <Button type="button" variant="ghost" onClick={() => doScan(true)}>
                Random
              </Button>
            </div>
            <div className="mt-1.5 min-h-4"><ErrorLine error={error} /></div>
          </form>
          <div>
            <Label className="mb-2">Hunt</Label>
            <LensSearch pickLabel="open" onPick={(l, nn) => nav(`/n/${l}/${nn}`)} />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-5 border-b border-line">
          {(["caught", "seen"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b py-2 text-[13px] ${tab === t ? "border-fg text-fg" : "border-transparent text-dim hover:text-fg"}`}>
              {t === "caught" ? "Caught by everyone" : "Seen by you"}
            </button>
          ))}
          {tab === "caught" && (
            <div className="ml-auto flex gap-3 font-pixel text-[11px] uppercase">
              <button onClick={() => setRarity(undefined)} className={rarity ? "text-faint hover:text-fg" : "text-fg"}>
                all
              </button>
              {RARITIES.map((r) => (
                <button key={r} onClick={() => setRarity(r)} className={rarity === r ? RARITY_COLOR[r] : "text-faint hover:text-fg"}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
        {tab === "caught" ? <Caught rarity={rarity} /> : <Seen token={token} />}
      </section>
    </div>
  );
}

function Caught({ rarity }: { rarity?: Rarity }) {
  const { results, status, loadMore } = usePaginatedQuery(api.neurons.dex, { rarity }, { initialNumItems: 50 });
  if (status === "LoadingFirstPage") return <div className="py-6 text-faint">loading</div>;
  if (!results.length) return <div className="py-6 text-dim">Nothing caught{rarity ? ` at ${rarity}` : ""} yet.</div>;
  return (
    <>
      <table className="w-full text-left">
        <tbody>
          {results.map((c) => (
            <tr key={`${c.layer}:${c.n}`} className="border-b border-line align-baseline">
              <td className="w-28 py-2"><NeuronLink layer={c.layer} n={c.n} /></td>
              <td className="py-2 font-medium">{c.name}</td>
              <td className="w-32 py-2"><RarityTag rarity={c.rarity} /></td>
              <td className="py-2 text-dim"><Tokens tokens={c.words} /></td>
              <td className="w-28 py-2 font-mono text-xs">
                <Link to={`/t/${c.handle}`} className="hover:underline underline-offset-4">{c.handle}</Link>
              </td>
              <td className="w-14 py-2 text-right font-mono text-xs">{c.points}</td>
              <td className="w-12 py-2 text-right font-mono text-xs text-faint">{ago(c.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {status === "CanLoadMore" && (
        <Button variant="ghost" className="mt-4" onClick={() => loadMore(50)}>
          More
        </Button>
      )}
    </>
  );
}

function Seen({ token }: { token?: string }) {
  const seen = useQuery(api.neurons.seen, { token });
  if (!token) return <div className="py-6 text-dim">Pick a handle and scan some neurons.</div>;
  if (seen === undefined) return <div className="py-6 text-faint">loading</div>;
  if (!seen.length) return <div className="py-6 text-dim">You haven't scanned anything yet.</div>;
  return (
    <table className="w-full text-left">
      <tbody>
        {seen.map((s) => (
          <tr key={`${s.layer}:${s.n}`} className="border-b border-line align-baseline">
            <td className="w-28 py-2"><NeuronLink layer={s.layer} n={s.n} /></td>
            <td className="w-32 py-2">{s.rarity ? <RarityTag rarity={s.rarity} /> : <span className="font-mono text-xs text-faint">measuring</span>}</td>
            <td className="py-2 text-dim"><Tokens tokens={s.words} /></td>
            <td className="w-20 py-2 font-mono text-xs text-faint">{s.source === "guess" ? "guessed" : "scanned"}</td>
            <td className="w-20 py-2 text-right font-mono text-xs">
              {s.caughtBy === "you" ? <span className="text-good">yours</span> : s.caughtBy ? <span className="text-faint">taken</span> : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

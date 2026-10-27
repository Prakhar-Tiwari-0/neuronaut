import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { MODEL } from "../../convex/rules";
import { Coverage } from "../components/Coverage";
import { Label, NeuronLink, RarityTag } from "../components/ui";
import { ago, until } from "../lib/format";
import { useSession } from "../lib/session";

export function Home() {
  const { token } = useSession();
  const overview = useQuery(api.neurons.overview);
  const daily = useQuery(api.daily.current, { token });
  const bounties = useQuery(api.bounties.list);
  const open = bounties?.filter((b) => b.state === "open") ?? [];
  const total = MODEL.layers * MODEL.width;

  const modes = [
    {
      to: "/daily",
      name: daily ? `Daily #${daily.number}` : "Daily",
      what: "One hidden neuron. Fifteen guesses.",
      status: !daily ? "picking" : daily.result ? (daily.result.solved ? `solved in ${daily.result.guesses}` : "missed") : `${daily.solvers}/${daily.players} solved`,
    },
    {
      to: "/dex",
      name: "Dex",
      what: "Scan, catch and name rare neurons. One owner each.",
      status: `${overview?.caught ?? 0} / ${total.toLocaleString()} caught`,
    },
    {
      to: "/bounties",
      name: "Bounties",
      what: "Steer the model to a target. Beat par.",
      status: open.length ? `${open.length} open · next closes in ${until(Math.min(...open.map((b) => b.endsAt)))}` : "none open",
    },
  ];

  return (
    <div className="space-y-16">
      <section className="pt-10">
        <h1 className="max-w-[18ch] text-5xl font-medium leading-[1.05] tracking-tight">
          {total.toLocaleString()} neurons. Catch the ones that matter.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[15px] text-dim">
          A game played inside {MODEL.name}. Push a neuron and the model starts talking about the sea, or turns into a doctor,
          or falls apart. Find the strange ones before anyone else.
        </p>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="border-t border-line">
          {modes.map((m) => (
            <Link key={m.to} to={m.to} className="group grid grid-cols-[160px_1fr_auto] items-baseline gap-6 border-b border-line py-5 hover:bg-raised">
              <span className="font-pixel text-lg">{m.name.toUpperCase()}</span>
              <span className="text-dim group-hover:text-fg">{m.what}</span>
              <span className="font-mono text-xs text-dim">{m.status} &rarr;</span>
            </Link>
          ))}
        </div>
        <div>
          <Label className="mb-2">Latest catches</Label>
          {overview?.recent.length ? (
            <div className="border-t border-line">
              {overview.recent.map((c) => (
                <div key={`${c.layer}:${c.n}`} className="flex items-baseline gap-3 border-b border-line py-2 text-[13px]">
                  <NeuronLink layer={c.layer} n={c.n} className="text-[12px]" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <RarityTag rarity={c.rarity} className="text-[10px]" />
                  <span className="w-8 text-right font-mono text-[11px] text-faint">{ago(c.at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t border-line pt-3 text-dim">Nothing caught yet. The board is empty.</div>
          )}
        </div>
      </section>

      <section>
        <Label className="mb-3">The board</Label>
        <div className="overflow-x-auto">
          <Coverage coverage={overview?.coverage ?? []} layers={MODEL.layers} bins={96} />
        </div>
      </section>
    </div>
  );
}

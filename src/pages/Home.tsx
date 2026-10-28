import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LIMITS, MODEL } from "../../convex/rules";
import { CaughtMap } from "../components/CaughtMap";
import { Label, NeuronLink, RarityTag } from "../components/ui";
import { ago, until } from "../lib/format";

function ModeCard({ to, title, tagline, steps, status }: { to: string; title: string; tagline: string; steps: string[]; status: string }) {
  return (
    <Link to={to} className="press group flex flex-col rounded-2xl border border-line bg-card p-6 hover:border-line-strong">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-pixel text-2xl">{title}</h2>
        <span className="text-right font-mono text-sm text-dim">{status}</span>
      </div>
      <p className="mt-2 text-[17px] font-medium">{tagline}</p>
      <ol className="mt-4 space-y-1.5 text-[15px] text-dim">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="font-mono text-faint">{i + 1}.</span>
            {s}
          </li>
        ))}
      </ol>
      <span className="mt-5 text-[15px] font-semibold group-hover:underline underline-offset-4">Play {title.toLowerCase()} &rarr;</span>
    </Link>
  );
}

export function Home() {
  const overview = useQuery(api.neurons.overview);
  const daily = useQuery(api.daily.current, {});
  const bounties = useQuery(api.bounties.list);
  const open = bounties?.filter((b) => b.state === "open") ?? [];
  const total = MODEL.layers * MODEL.width;

  const dailyStatus = !daily
    ? "being picked"
    : daily.result
      ? daily.result.solved
        ? `you solved it in ${daily.result.guesses}`
        : "you missed it"
      : daily.guesses.length
        ? `${daily.guesses.length}/${daily.limit} guesses used`
        : `${daily.solvers} solved so far`;

  return (
    <div className="space-y-14">
      <section className="pt-6 text-center sm:pt-12">
        <h1 className="mx-auto max-w-[16ch] text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Find the neuron behind the words.</h1>
        <p className="mx-auto mt-5 max-w-[52ch] text-lg text-dim">
          {MODEL.name} has {total.toLocaleString()} neurons. Push one and the model starts talking about the sea, turns into a
          doctor, or falls apart. Each day one of them is hidden. Can you find it?
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link to="/daily" className="press inline-flex h-16 items-center rounded-2xl bg-accent px-10 text-xl font-semibold text-accent-fg hover:opacity-90">
            Play today's neuron{daily ? ` #${daily.number}` : ""}
          </Link>
          <span className="text-dim">{dailyStatus}</span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <ModeCard
          to="/daily"
          title="Daily"
          tagline={`One hidden neuron. ${LIMITS.guesses} guesses.`}
          steps={["Read the strange answers", "Search for words you see", "Guess until the bar turns green"]}
          status={dailyStatus}
        />
        <ModeCard
          to="/dex"
          title="Dex"
          tagline="Collect the rarest neurons."
          steps={["Pick a neuron: a word, a map spot, or random", `Predict what it does, then scan (${LIMITS.scans} a day)`, `Catch and name it (${LIMITS.catches} a day)`]}
          status={`${overview?.caught ?? 0} caught`}
        />
        <ModeCard
          to="/bounties"
          title="Bounties"
          tagline="Steer the model to a target."
          steps={["Pick a target, like the sea", "Choose neurons and how hard to push", "Beat par for the top spot"]}
          status={open.length ? `${open.length} open · ${until(Math.min(...open.map((b) => b.endsAt)))} left` : "none open"}
        />
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <CaughtMap />
        <div>
          <Label className="mb-3">Latest catches</Label>
          {overview?.recent.length ? (
            <div className="space-y-1.5">
              {overview.recent.map((c) => (
                <div key={`${c.layer}:${c.n}`} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5">
                  <NeuronLink layer={c.layer} n={c.n} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <RarityTag rarity={c.rarity} />
                  <span className="w-8 text-right font-mono text-xs text-faint">{ago(c.at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-card p-4 text-dim">Nothing caught yet. Be the first.</div>
          )}
        </div>
      </section>
    </div>
  );
}

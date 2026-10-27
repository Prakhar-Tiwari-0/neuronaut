import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Label, NeuronLink, RarityTag, Stat } from "../components/ui";

export function Trainers() {
  const top = useQuery(api.players.leaderboard);
  return (
    <div>
      <h1 className="font-pixel text-3xl">TRAINERS</h1>
      {top === undefined ? (
        <div className="py-6 text-faint">loading</div>
      ) : top.length === 0 ? (
        <div className="py-6 text-dim">Nobody yet. Be first.</div>
      ) : (
        <table className="mt-6 w-full text-left font-mono text-xs">
          <thead>
            <tr>
              {["#", "trainer", "points", "caught", "dailies", "streak", "best", "bounty wins"].map((h, i) => (
                <th key={h} className={`pb-2 font-normal ${i > 1 ? "text-right" : ""}`}><Label className="text-faint">{h}</Label></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((p, i) => (
              <tr key={p.handle} className="border-t border-line">
                <td className="w-8 py-2 text-faint">{i + 1}</td>
                <td className="py-2"><Link to={`/t/${p.handle}`} className="text-fg hover:underline underline-offset-4">{p.handle}</Link></td>
                <td className="py-2 text-right text-fg">{p.points}</td>
                <td className="py-2 text-right">{p.caught}</td>
                <td className="py-2 text-right">{p.dailySolved}</td>
                <td className="py-2 text-right">{p.streak}</td>
                <td className="py-2 text-right">{p.bestStreak}</td>
                <td className="py-2 text-right">{p.bountyWins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Trainer() {
  const { handle = "" } = useParams();
  const p = useQuery(api.players.profile, { handle });
  if (p === undefined) return <div className="py-20 text-center text-faint">loading</div>;
  if (p === null) return <div className="py-20 text-center text-dim">No trainer called {handle}.</div>;
  return (
    <div className="max-w-[920px]">
      <h1 className="text-3xl font-medium tracking-tight">{p.handle}</h1>
      <div className="mt-6 grid grid-cols-3 gap-6 md:grid-cols-5">
        <Stat label="Points" value={p.points} />
        <Stat label="Caught" value={p.catches.length} />
        <Stat label="Dailies" value={p.dailySolved} />
        <Stat label="Streak" value={p.streak} sub={`best ${p.bestStreak}`} />
        <Stat label="Bounty wins" value={p.bountyWins} />
      </div>
      <div className="mt-10">
        <Label className="mb-2">Dex</Label>
        {p.catches.length === 0 ? (
          <div className="text-dim">No catches yet.</div>
        ) : (
          <table className="w-full text-left">
            <tbody>
              {p.catches.map((c) => (
                <tr key={`${c.layer}:${c.n}`} className="border-t border-line align-baseline">
                  <td className="w-28 py-2"><NeuronLink layer={c.layer} n={c.n} /></td>
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="w-32 py-2"><RarityTag rarity={c.rarity} /></td>
                  <td className="w-16 py-2 text-right font-mono text-xs">{c.points}</td>
                  <td className="w-24 py-2 text-right font-mono text-xs text-faint">{c.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

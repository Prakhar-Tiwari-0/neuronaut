import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { BehaviorMap, type Dot, ZoneLegend, zoneAt } from "../components/BehaviorMap";
import { Button, ErrorLine, Label, Steps } from "../components/ui";
import zones from "../data/zones.json";
import { useUnlock } from "../lib/notes";
import { errorText, useSession } from "../lib/session";

export function MapPage() {
  const { me, requireJoin } = useSession();
  const nav = useNavigate();
  const mine = useQuery(api.map.mine, {});
  const caught = useQuery(api.map.caught, {});
  const here = useMutation(api.map.here);
  const [cell, setCell] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useUnlock("map", true);

  const dots = useMemo<Dot[]>(() => {
    const seen = new Set((mine ?? []).map((m) => `${m.layer}:${m.n}`));
    return [
      ...(caught ?? []).filter((c) => !seen.has(`${c.layer}:${c.n}`)).map((c) => ({ ...c, color: "--fg", ring: true, label: c.name })),
      ...(mine ?? []).map((m) => ({ ...m, color: "--fg" })),
    ];
  }, [mine, caught]);

  const zone = cell === null ? null : zoneAt(cell);
  const scanHere = async () => {
    setError(null);
    if (cell === null || !(await requireJoin())) return;
    try {
      const r = await here({ cell });
      if (!r) return setError("You've seen every neuron in this square. Try another.");
      nav(`/n/${r.layer}/${r.n}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="font-pixel text-4xl">MAP</h1>
          <div className="mt-1 h-6 text-dim">
            {zones.placed.toLocaleString()} neurons placed by what pushing them does · {mine ? `${mine.length} seen by you` : " "}
          </div>
        </div>
        <Steps
          steps={[
            <>Neurons that act alike sit close together. Colors are zones of similar effects.</>,
            <>Tap a spot to pick a neuron from it, then predict what it does before you scan.</>,
            <>Your neurons fill in as dots. Rings are ones other players caught.</>,
          ]}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-line bg-card p-3 sm:p-4 lg:self-start">
          <BehaviorMap dots={dots} selected={cell} onCell={setCell} onDot={(d) => nav(`/n/${d.layer}/${d.n}`)} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="min-h-40 rounded-2xl border border-line bg-card p-5">
            {zone ? (
              <>
                <Label>You picked</Label>
                <div className="mt-2">
                  <ZoneLegend only={zone.id} />
                </div>
                <Button size="lg" className="mt-4 w-full" onClick={scanHere} disabled={!!me && me.scansLeft <= 0}>
                  Pick a neuron here
                </Button>
                {me && <div className="mt-2 text-center text-sm text-dim">{me.scansLeft} scans left today</div>}
                <div className="mt-2">
                  <ErrorLine error={error} />
                </div>
              </>
            ) : (
              <div className="text-dim">
                Tap anywhere on the map to see what lives there. {Math.round((1 - zones.placed / zones.total) * 100)}% of
                neurons are quiet: pushed alone, they barely change anything, so they have no place here.
              </div>
            )}
          </div>
          <div>
            <Label className="mb-3">Zones</Label>
            <ZoneLegend />
          </div>
        </aside>
      </div>
    </div>
  );
}

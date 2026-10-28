import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { BehaviorMap } from "./BehaviorMap";
import { Label } from "./ui";

// Every caught neuron on the behavior map, linking to the full map.
export function CaughtMap() {
  const caught = useQuery(api.map.caught, {});
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <Label>The map: caught neurons, placed by what they do</Label>
        <Link to="/map" className="text-sm font-medium underline underline-offset-4">
          Explore the map
        </Link>
      </div>
      <Link to="/map" className="block rounded-2xl border border-line bg-card p-3 hover:border-line-strong sm:p-4" aria-label="Open the map">
        <div className="mx-auto max-w-[560px]">
          <BehaviorMap labels dots={(caught ?? []).map((c) => ({ ...c, color: "--fg", label: c.name }))} />
        </div>
      </Link>
    </div>
  );
}

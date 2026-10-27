import { Label } from "./ui";

// Steered replies next to the unsteered model's replies to the same prompts.
export function Replies({ prompts, steered, baseline, steeredLabel = "steered" }: { prompts: string[]; steered: string[]; baseline?: string[]; steeredLabel?: string }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {prompts.map((p, i) => (
        <div key={i} className="py-3">
          <div className="font-mono text-[12px] text-dim">&gt; {p}</div>
          <div className={`mt-2 grid gap-4 ${baseline ? "md:grid-cols-2" : ""}`}>
            <div>
              <Label className="mb-1 text-fg">{steeredLabel}</Label>
              <div className="screen text-fg">{steered[i] || "(silence)"}</div>
            </div>
            {baseline && (
              <div>
                <Label className="mb-1">normal</Label>
                <div className="screen text-faint">{baseline[i]}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

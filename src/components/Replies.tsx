// Steered replies next to another set of replies to the same prompts (the unsteered model's, by default), one card per
// prompt.
export function Replies({
  prompts,
  steered,
  baseline,
  steeredLabel = "With this neuron pushed",
  baselineLabel = "Normal",
}: {
  prompts: string[];
  steered: string[];
  baseline?: string[];
  steeredLabel?: string;
  baselineLabel?: string;
}) {
  return (
    <div className="space-y-4">
      {prompts.map((p, i) => (
        <div key={i} className="rounded-2xl border border-line bg-card p-5">
          <div className="text-[15px] font-semibold">{p}</div>
          <div className={`mt-3 grid gap-5 ${baseline ? "md:grid-cols-2" : ""}`}>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider">{steeredLabel}</div>
              <div className="screen text-fg">{steered[i] || "(silence)"}</div>
            </div>
            {baseline && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">{baselineLabel}</div>
                <div className="screen text-dim">{baseline[i]}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

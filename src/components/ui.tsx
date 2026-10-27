import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Rarity } from "../../convex/rules";
import { RARITY_COLOR, RARITY_MARKS, dexNo, heatColor } from "../lib/format";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const base = "h-8 px-3.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";
  const look = variant === "primary" ? "bg-fg text-bg hover:bg-dim" : "border border-line-strong text-fg hover:border-faint hover:bg-raised";
  return <button className={`${base} ${look} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-8 rounded-md border border-line-strong bg-bg px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-dim ${className}`}
      {...props}
    />
  );
}

// Layer / neuron number inputs side by side.
export function NeuronInput({ layer, n, onLayer, onN }: { layer: string; n: string; onLayer: (v: string) => void; onN: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 font-mono">
      <span className="text-faint text-xs">L</span>
      <Input value={layer} onChange={(e) => onLayer(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="0-31" className="w-14 font-mono" inputMode="numeric" aria-label="layer" />
      <span className="text-faint text-xs">N</span>
      <Input value={n} onChange={(e) => onN(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0-9215" className="w-20 font-mono" inputMode="numeric" aria-label="neuron" />
    </div>
  );
}

export function NeuronLink({ layer, n, className = "" }: { layer: number; n: number; className?: string }) {
  return (
    <Link to={`/n/${layer}/${n}`} className={`font-pixel text-[13px] hover:underline underline-offset-4 ${className}`}>
      {dexNo(layer, n)}
    </Link>
  );
}

export function RarityTag({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const marks = RARITY_MARKS[rarity];
  return (
    <span className={`inline-flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-wide ${RARITY_COLOR[rarity]} ${className}`}>
      <span className="inline-flex gap-[2px]">
        {Array.from({ length: Math.max(1, marks) }, (_, i) => (
          <span key={i} className={`pixel-mark ${marks === 0 ? "opacity-40" : ""}`} />
        ))}
      </span>
      {rarity}
    </span>
  );
}

// Retro block meter for a daily guess's heat (-100..100).
export function HeatBar({ heat, correct = false, cells = 14 }: { heat: number | null; correct?: boolean; cells?: number }) {
  const filled = correct ? cells : heat === null ? 0 : Math.round((Math.max(0, heat) / 100) * cells);
  return (
    <span className={`font-mono text-[12px] tracking-[-1px] ${heatColor(heat, correct)}`} aria-hidden>
      {"█".repeat(filled)}
      <span className="text-line-strong">{"█".repeat(cells - filled)}</span>
    </span>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`font-pixel text-[11px] uppercase tracking-wider text-dim ${className}`}>{children}</div>;
}

export function Tokens({ tokens, className = "" }: { tokens: string[]; className?: string }) {
  return (
    <span className={`font-mono text-[12px] ${className}`}>
      {tokens.map((t, i) => (
        <span key={i} className="mr-2 inline-block">
          {t}
        </span>
      ))}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 font-mono text-lg">{value}</div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <div className="text-xs text-glitch">{error}</div> : null;
}

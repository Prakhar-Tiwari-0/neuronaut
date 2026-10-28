import { HINTS, LIMITS, MODEL } from "../../convex/rules";
import { rankText } from "../lib/format";
import { Button, HeatBar, Modal } from "./ui";

const EXAMPLES: { id: string; heat: number; rank: number; correct?: boolean; note: string }[] = [
  { id: "05·0100", heat: 6, rank: 147_000, note: "Cold. Its effect is nothing like the hidden one's." },
  { id: "17·4242", heat: 33, rank: 4_600, note: "Warm. Closer than most." },
  { id: "21·3849", heat: 76, rank: 20, note: "Hot. Only 19 neurons are closer." },
  { id: "23·8663", heat: 100, rank: 0, correct: true, note: "Found it." },
];

// The rules, Wordle-style: the daily first (it's the main game), then the other two modes in a line each.
export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="How to play">
      <h2 className="font-pixel text-2xl">HOW TO PLAY</h2>
      <p className="mt-3 text-[17px] leading-relaxed">
        <b>Find the hidden neuron in {LIMITS.guesses} guesses.</b> Each day one of the {(MODEL.layers * MODEL.width).toLocaleString()} neurons
        inside {MODEL.name} is pushed while the model answers three questions. Read how it changed the answers, then guess which neuron did it.
      </p>
      <ul className="mt-4 space-y-2 text-[15px] leading-relaxed">
        <li>
          A neuron is a <b>layer</b> (0-{MODEL.layers - 1}) and a <b>number</b> (0-{MODEL.width - 1}).
        </li>
        <li>
          Search for words you see in the answers, like <i>ocean</i> or <i>doctor</i>. That lists neurons likely to cause them.
        </li>
        <li>Each guess gets a heat and a rank: how close its effect is to the hidden one's.</li>
        <li>
          Stuck? After {HINTS.band} guesses you get the layer range, after {HINTS.token} a word the neuron pushes.
        </li>
      </ul>

      <div className="mt-6 space-y-3">
        {EXAMPLES.map((e) => (
          <div key={e.id}>
            <div className="flex items-center gap-3">
              <span className="w-20 font-pixel text-sm">{e.id}</span>
              <div className="flex-1">
                <HeatBar heat={e.heat} correct={e.correct} />
              </div>
              <span className="w-14 text-right font-mono text-sm tabular-nums">{e.correct ? "hit" : rankText(e.rank)}</span>
            </div>
            <div className="mt-1 text-sm text-dim">{e.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-2 border-t border-line pt-5 text-[15px] leading-relaxed">
        <p>
          <b>Dex.</b> Predict what a neuron does, scan it to find out, then catch the best ones. Each has one owner.
        </p>
        <p>
          <b>Bounties.</b> Pick neurons that push the model toward a target, like talking about the sea. Beat the house's score.
        </p>
        <p>
          <b>Map, lab and notes.</b> See neurons laid out by what they do, test whether two pushes add up, and collect field
          notes on how the model works as you play.
        </p>
      </div>

      <Button className="mt-6 w-full" size="lg" onClick={onClose}>
        Play
      </Button>
    </Modal>
  );
}

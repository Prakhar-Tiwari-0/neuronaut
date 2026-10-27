import { BOUNTY_DAYS } from "../../convex/bountyPool";
import { HINTS, LIMITS, MODEL, POINTS, RARITIES } from "../../convex/rules";
import { Label, RarityTag } from "../components/ui";

export function How() {
  return (
    <div className="max-w-[720px] space-y-10 text-[15px] leading-relaxed">
      <div>
        <h1 className="font-pixel text-3xl">HOW TO PLAY</h1>
        <p className="mt-4 text-dim">
          {MODEL.name} has {MODEL.layers} layers of {MODEL.width.toLocaleString()} MLP neurons. Pushing one while the model
          writes changes what it says: some make it talk about the sea, some make it a doctor, most do almost nothing. Your job
          is to find the ones that matter.
        </p>
      </div>
      <section>
        <Label className="mb-2">Hunting</Label>
        <p>
          Every neuron has a steer lens (the tokens a push makes more likely) and a logit lens. Search them for free. Lenses
          hint, they don't tell: the only way to know what a neuron really does is to scan it.
        </p>
      </section>
      <section>
        <Label className="mb-2">Dex</Label>
        <p>
          You get {LIMITS.scans} scans a day. A scan runs the model with the neuron pushed and reveals its replies and rarity.
          You can catch {LIMITS.catches} scanned neurons a day, and each neuron has one owner, forever. A catch is worth its
          rarity's points times one plus its uniqueness, so a neuron unlike anything already caught is worth up to double.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-y-1.5">
          {RARITIES.map((r) => (
            <div key={r} className="flex items-center gap-3">
              <RarityTag rarity={r} />
              <span className="font-mono text-xs text-dim">{POINTS[r]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-dim">
          Rarity is how strongly the neuron moves the model compared with random pushes of the same size. Glitches break it:
          loops, gibberish, silence.
        </p>
      </section>
      <section>
        <Label className="mb-2">Daily</Label>
        <p>
          Each day one neuron is pushed while the model answers three prompts. Find it in {LIMITS.guesses} guesses. Each guess
          shows heat: how similar that neuron's effect is to the hidden one's, and its rank among the hidden neuron's nearest
          measured neighbours. After {HINTS.band} guesses you get a band of eight layers, after {HINTS.token} its top steer
          token. Solve it to keep your streak.
        </p>
      </section>
      <section>
        <Label className="mb-2">Bounties</Label>
        <p>
          A bounty names a target: the sea, French, gloom. Enter neurons and doses; the judge runs them on hidden prompts and
          scores concept (how far the replies move toward the target), coherence (still readable) and efficiency (smaller total
          dose). The house sets par. Bounties run {BOUNTY_DAYS} days, and the top three win points. Everyone's neurons are
          revealed when it closes.
        </p>
      </section>
    </div>
  );
}

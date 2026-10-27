"""Writes the game's neuron index, one JSON line per neuron with its steer lens and logit lens tokens, for
`npx convex import --table neurons`:

    uv run python build_neurons.py > ../data/neurons.jsonl
"""
import json
import sys

from lens import Lens, norm


def show(t):
    return t.strip() or "␣"


def main():
    lz = Lens()
    L, N = lz.steer.shape[:2]
    out = sys.stdout
    for l in range(L):
        for n in range(N):
            steer = [lz.vocab[i] for i in lz.steer[l, n] if i >= 0]
            lens = [lz.vocab[i] for i in lz.lens[l, n, :6] if i >= 0]
            terms = [norm(t) for t in steer[:3]] * 2 + [norm(t) for t in steer[3:] + lens]
            out.write(json.dumps({"layer": l, "n": n, "steer": [show(t) for t in steer[:10]], "lens": [show(t) for t in lens],
                                  "terms": " ".join(t for t in terms if t)}, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()

"""The GPU worker: takes jobs from Convex (profiles, bounty judging, par searches, daily puzzles) and, with --sweep,
measures every neuron in the model while it has nothing else to do.

    CONVEX_URL=http://127.0.0.1:3210 WORKER_SECRET=... uv run python main.py [--sweep]

Players wait on profile and judge jobs (priority 0), so those go first; the sweep only runs one batch at a time between
checks for new jobs.
"""
import argparse
import os
import random
import time
import traceback
from collections import Counter

import numpy as np
from convex import ConvexClient

from engine import PROFILE_DOSE, Engine, distinct2, words
from lens import Lens, norm

MODEL = os.environ.get("GAME_MODEL", "Qwen/Qwen3.5-4B")
RARE_Z, GLITCH_NLL, GLITCH_DISTINCT = 3.5, 3.2, 0.5  # mirrors convex/rules.ts
DISPLAY_PROMPTS = [  # daily puzzle prompts: never the profile prompts, so a card's text can't be matched verbatim
    "What do you think about on a rainy afternoon?",
    "Write a short note to a friend.",
    "Explain how to make a cup of tea.",
    "What is the most interesting thing you know?",
    "Describe the view from a window.",
    "Give me three tips for a long trip.",
    "What would you name a new pet?",
    "Tell me about an old photograph.",
    "What makes a good morning?",
    "Describe a sound you like.",
]
PAR_DOSES = [0.4, 0.7, 1.0]
NEIGHBOR_EVERY = 600  # sweep batches (~1.5 h) between refreshes of upcoming dailies' neighbor cosines


def as_profile(p):
    return {k: p[k] for k in ("layer", "n", "texts", "words", "z", "nll", "distinct", "embedding")}


class Worker:
    def __init__(self, url, secret):
        self.url, self.secret = url, secret
        self.c = ConvexClient(url)
        self.eng = Engine(MODEL)
        self.lens = Lens()

    def call(self, kind, name, **args):
        return getattr(self.c, kind)(name, {"secret": self.secret, **args})

    # ---------- jobs ----------
    def run(self, jobs):
        by = {}
        for j in jobs:
            by.setdefault(j["kind"], []).append(j)
        if "profile" in by:
            self.guard(by["profile"], self.profiles)
        for j in by.get("judge", []):
            self.guard([j], lambda js: self.judge(js[0]))
        for j in by.get("par", []):
            self.guard([j], lambda js: self.par(js[0]))
        for j in by.get("daily", []):
            self.guard([j], lambda js: self.daily(js[0]))

    def guard(self, jobs, fn):
        try:
            fn(jobs)
        except Exception as e:
            traceback.print_exc()
            for j in jobs:
                self.call("mutation", "worker:fail", id=j["id"], error=f"{type(e).__name__}: {e}")

    def profiles(self, jobs):
        neurons = [(int(j["args"]["layer"]), int(j["args"]["n"])) for j in jobs]
        t = time.time()
        res = self.eng.profile(neurons)
        self.call("mutation", "worker:putProfiles", jobIds=[j["id"] for j in jobs], profiles=[as_profile(p) for p in res])
        print(f"profiled {len(res)} in {time.time() - t:.1f}s", flush=True)

    def judge(self, job):
        a = job["args"]
        entry = [(int(p["layer"]), int(p["n"]), float(p["dose"])) for p in a["pushes"]]
        r, = self.eng.judge([entry], a["prompts"], a["anchors"])
        self.call("mutation", "worker:finishJudge", id=job["id"], entryId=a["entryId"], **r)
        print(f"judged {a['slug']} {entry}: {r['score']}", flush=True)

    def par(self, job):
        """The house attempt at a bounty: neurons whose steer lens matches the anchors' words, each tried at a few doses
        on its own. The best score is par."""
        a = job["args"]
        ws = [w for w, _ in Counter(w for t in a["anchors"] for w in words(t) if w not in self.eng.generic).most_common(30)]
        cands = self.lens.candidates(ws, k=64)
        entries = [[(l, n, d)] for l, n in cands for d in PAR_DOSES]
        best = (0.0, None)
        for s in range(0, len(entries), 48):
            chunk = entries[s:s + 48]
            for e, r in zip(chunk, self.eng.judge(chunk, a["prompts"], a["anchors"])):
                if r["score"] > best[0]:
                    best = (r["score"], e)
        pushes = [{"layer": l, "n": n, "dose": d} for l, n, d in best[1]] if best[1] else []
        self.call("mutation", "worker:putPar", id=job["id"], slug=a["slug"], score=best[0], pushes=pushes)
        print(f"par {a['slug']}: {best}", flush=True)

    def daily(self, job):
        """Picks a hidden neuron for a date: strong (rare or better), coherent, with distinctive words a player can
        find through lens search, and no near-twin among measured neurons (so one answer)."""
        a = job["args"]
        rng = random.Random(a["date"])
        exclude = set(a.get("exclude", []))
        L, N = self.lens.kl.shape
        # spread answers over depth: each date draws a band, then the strongest 10% (steer KL) within it
        lo, hi = rng.choice([(3, 10), (11, 18), (19, 25), (26, L - 2)])
        band = self.lens.kl[lo:hi + 1]
        strong = np.argwhere(band >= np.quantile(band, 0.9)) + [lo, 0]
        for attempt in range(6):
            pick = [tuple(map(int, strong[i])) for i in rng.sample(range(len(strong)), 64)]
            pick = [(l, n) for l, n in pick if f"{l}:{n}" not in exclude]
            profs = self.eng.profile(pick)
            self.call("mutation", "worker:putProfiles", jobIds=[], profiles=[as_profile(p) for p in profs])
            good = [p for p in profs if p["z"] >= RARE_Z and p["nll"] <= GLITCH_NLL and p["distinct"] >= GLITCH_DISTINCT
                    and len(p["words"]) >= 3 and any(self.lens.findable(p["layer"], p["n"], w) for w in p["words"][:6])]
            rng.shuffle(good)
            for p in good:
                near = self.call("action", "worker:nearest", embedding=p["embedding"], limit=3)
                twin = max([s for s in near if s < 0.9999] or [0])
                if twin < 0.9 and self.publish(job, a["date"], p, rng):
                    return
            print(f"daily {a['date']}: attempt {attempt} found no puzzle among {len(good)} candidates", flush=True)
        raise RuntimeError("no suitable neuron found")

    def publish(self, job, date, p, rng):
        """Writes the puzzle if the neuron's replies to the display prompts stay readable (no loops, no silence);
        returns whether it did."""
        l, n = p["layer"], p["n"]
        prompts = rng.sample(DISPLAY_PROMPTS, 3)
        texts, baseline = [], []
        for q in prompts:
            (s, ids), (b, _) = self.eng.generate(q, [[self.eng.push(l, n, PROFILE_DOSE)], []])
            if not s or distinct2(ids) < 0.7:
                return False
            texts.append(s)
            baseline.append(b)
        lo = max(0, min(self.eng.L - 8, l - rng.randint(0, 7)))
        hint = next((t.strip() for t in self.lens.tokens(l, n, 12) if norm(t)), self.lens.tokens(l, n, 1)[0].strip())
        self.call("action", "worker:putDaily", id=job["id"], date=date, layer=l, n=n, prompts=prompts, texts=texts,
                  baseline=baseline, embedding=p["embedding"], band=[lo, lo + 7], hint=hint)
        print(f"daily {date}: L{l} N{n} {p['words'][:5]} z={p['z']:.1f}", flush=True)
        return True

    # ---------- sweep ----------
    def sweep_batch(self, state, size=64):
        """Measures the next `size` neurons of a fixed random order of the whole model. Returns False when done.
        64 rows peak at ~14.4 GiB on a 16 GB card. Past what's free, WSL spills to system RAM and decode gets ~9x slower
        per row, so don't raise it without measuring."""
        order, path = state
        cur = int(open(path).read()) if os.path.exists(path) else 0
        if cur >= len(order):
            return False
        chunk = [tuple(map(int, order[i])) for i in range(cur, min(cur + size, len(order)))]
        t = time.time()
        res = self.eng.profile(chunk, batch=size)
        added = self.call("mutation", "worker:putProfiles", jobIds=[], profiles=[as_profile(p) for p in res])
        open(path, "w").write(str(cur + len(chunk)))
        print(f"sweep {cur + len(chunk)}/{len(order)} (+{added}) {time.time() - t:.1f}s", flush=True)
        done = cur + len(chunk) >= len(order)
        if done or (cur // size + 1) % NEIGHBOR_EVERY == 0:  # daily ranks sharpen as coverage grows
            print(f"refreshed neighbors of {self.call('action', 'worker:refreshNeighbors')} dailies", flush=True)
        return True

    def wait(self):
        sub = self.c.subscribe("worker:pending", {"secret": self.secret})
        try:
            for count in sub:
                if count:
                    return
        finally:
            sub.unsubscribe()

    def loop(self, sweep):
        state = None
        if sweep:
            L, N = self.lens.kl.shape
            order = np.random.default_rng(0).permutation(np.argwhere(np.ones((L, N), bool)))
            state = (order, os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", f"sweep-{MODEL.replace('/', '--')}.cursor"))
        self.call("mutation", "worker:putBaseline", prompts=[b["prompt"] for b in self.eng.base],
                  texts=[b["text"] for b in self.eng.base])
        print("worker ready", flush=True)
        while True:
            jobs = self.call("mutation", "worker:claim", max=24)
            if jobs:
                self.run(jobs)
            elif not (state and self.sweep_batch(state)):
                self.wait()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", action="store_true", help="measure every neuron when idle")
    a = ap.parse_args()
    w = Worker(os.environ["CONVEX_URL"], os.environ["WORKER_SECRET"])
    while True:
        try:
            w.loop(a.sweep)
        except KeyboardInterrupt:
            raise
        except Exception:  # Convex unreachable and the like: keep the model loaded and retry
            traceback.print_exc()
            time.sleep(10)
            # a client whose connection died ("channel closed") hangs on every later call, so start a fresh one; its
            # first call waits until the backend is back
            w.c = ConvexClient(w.url)


if __name__ == "__main__":
    main()

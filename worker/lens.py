"""The steer lens and logit lens for every neuron, from neuron-explorer's caches (downloaded on first use).

steer[l, n] lists the 12 tokens a push on neuron n makes most likely (strongest first); lens[l, n] is the logit lens of
its write direction; kl[l, n] is how much a push moves the next-token prediction. Players search the same tokens in the
game (neurons.terms), so the worker uses them to check a daily answer is findable and to seed par searches.
"""
import json
import os
import re
import urllib.request

import numpy as np

UPSTREAM = "https://raw.githubusercontent.com/lyramakesmusic/neuron-explorer/main/explorer/cache"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
ALPHA = re.compile(r"^[a-z][a-z'-]+$")


def fetch(name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        print("downloading", name, flush=True)
        urllib.request.urlretrieve(f"{UPSTREAM}/{name}", path + ".part")
        os.rename(path + ".part", path)
    return path


def norm(t):
    """A token as a search term: trimmed, lowercased, letters only (or None)."""
    t = t.strip().lower()
    return t if len(t) >= 3 and ALPHA.match(t) else None


class Lens:
    def __init__(self):
        st = np.load(fetch("steer_index.npz"))
        self.steer, self.kl = st["up"], st["up_kl"]
        self.lens = np.load(fetch("lens_index.npz"))["up"]
        self.vocab = json.load(open(fetch("vocab.json")))
        self.terms = np.array([norm(t) or "" for t in self.vocab], dtype=object)

    def tokens(self, l, n, k=8, which="steer"):
        ids = (self.steer if which == "steer" else self.lens)[l, n, :k]
        return [self.vocab[i] for i in ids if i >= 0]

    def term_ids(self, word):
        return np.flatnonzero(self.terms == word)

    def findable(self, l, n, word, within=100):
        """Whether searching `word` puts neuron (l, n) in the top `within`: neurons whose steer lens holds the word at
        an earlier position (ties broken against the answer) rank ahead of it."""
        ids = self.term_ids(word)
        if not len(ids) or not np.isin(self.steer[l, n], ids).any():  # cheap check first: most words miss
            return False
        hit = np.isin(self.steer, ids)  # [L, N, 12]
        pos = np.where(hit.any(-1), hit.argmax(-1), 99)
        return int((pos <= pos[l, n]).sum()) <= within

    def candidates(self, words, k=96, min_layer=2):
        """Neurons whose steer lens mentions the most of `words` (earlier positions count more), for par searches."""
        score = np.zeros(self.steer.shape[:2], np.float32)
        for w in words:
            ids = self.term_ids(w)
            if len(ids):
                hit = np.isin(self.steer, ids)
                score += (hit * (1.0 / (1 + np.arange(self.steer.shape[-1])))).sum(-1)
        score[:min_layer] = 0
        flat = np.argsort(-score, axis=None)[:k]
        return [(int(i // score.shape[1]), int(i % score.shape[1])) for i in flat if score.flat[i] > 0]

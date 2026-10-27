"""Checks on generated text, kept free of torch so they test (and run in CI) without the model."""
import re


def distinct2(ids):
    pairs = list(zip(ids, ids[1:]))
    return len(set(pairs)) / len(pairs) if pairs else 0.0


RUN = re.compile(r"(\S{1,4}?)\1{9,}")  # one short visible unit repeated 10+ times in a row


def degenerate(text):
    """Empty, or contains a run like ",,,,,,,,,," or "hahahahahahahahahaha". Token distinct-2 misses these: a run of
    commas tokenizes into different multi-comma pieces, so it scores as clean as normal prose."""
    return not text or RUN.search(text) is not None

"""Keeps the README's sweep section current: every INTERVAL seconds, reads the worker log, rewrites the block between the
sweep markers, and commits and pushes README.md alone. Exits once the sweep is done.

    setsid nohup python3 worker/readme_progress.py >> logs/readme_progress.log 2>&1 &

Run from the repo root. Needs no venv.
"""
import os
import re
import subprocess
import time
from datetime import datetime, timezone

INTERVAL = 600
STALL = 300  # seconds without a new sweep line before the README says it's stalled
LOG, README = "logs/worker.log", "README.md"
START, END = "<!-- sweep:start -->", "<!-- sweep:end -->"
LINE = re.compile(r"^sweep (\d+)/(\d+) \(\+[\d.]+\) ([\d.]+)s$", re.M)


def utc(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def status():
    """The section's markdown and whether the sweep is finished, or None if the log has no sweep lines yet."""
    lines = LINE.findall(open(LOG).read())
    if not lines:
        return None
    done, total = int(lines[-1][0]), int(lines[-1][1])
    recent = [float(s) for _, _, s in lines[-30:]]
    per_batch = sorted(recent)[len(recent) // 2]  # median: one batch that waited out an outage doesn't skew it
    size = done - int(lines[-2][0]) if len(lines) > 1 and done > int(lines[-2][0]) else 64
    now, last = time.time(), os.path.getmtime(LOG)
    bar = "█" * round(30 * done / total) + "░" * (30 - round(30 * done / total))
    if done >= total:
        state = "**Done.**"
    elif now - last > STALL:
        state = f"**Stalled** since {utc(last)}."
    else:
        eta = now + (total - done) / size * per_batch
        state = f"About {(total - done) / size * per_batch / 3600:.1f} h left at {per_batch / size * 1000:.0f} ms per neuron, ETA {utc(eta)}."
    md = (f"{START}\n**Sweep progress** (every neuron in Qwen3.5-4B, measured once on a 4080 Super)\n\n"
          f"`{bar}` {done:,} / {total:,} ({100 * done / total:.1f}%)\n\n{state} Updated {utc(now)}.\n{END}")
    return md, done >= total


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True)


def publish(md):
    s = open(README).read()
    new = re.sub(re.escape(START) + ".*?" + re.escape(END), md.replace("\\", r"\\"), s, flags=re.S)
    if new == s:
        return
    open(README, "w").write(new)
    pct = re.search(r"\(([\d.]+%)\)", md).group(1)
    r = git("commit", "-q", "-m", f"chore: sweep progress {pct}", "--", README)
    if r.returncode:
        print("commit failed:", r.stderr.strip(), flush=True)
        return
    if git("push", "-q", "origin", "HEAD").returncode:  # someone else pushed: replay on top of theirs, then retry
        git("pull", "-q", "--rebase", "--autostash", "origin", "main")
        r = git("push", "-q", "origin", "HEAD")
        if r.returncode:
            print("push failed:", r.stderr.strip(), flush=True)
            return
    print(f"{utc(time.time())} pushed {pct}", flush=True)


def main():
    while True:
        st = status()
        if st:
            md, finished = st
            publish(md)
            if finished:
                return
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()

# neurodex

A game about the neurons inside an open language model (Qwen3.5-4B). Catch rare neurons for your dex, find the hidden
neuron of the day, and win bounties by steering the model with the neurons you find.

Built on [neuron-explorer](https://github.com/lyramakesmusic/neuron-explorer) by
[lyramakesmusic](https://github.com/lyramakesmusic), used with permission. The steering method, the steer lens and the
neuron index come from that project.

<!-- sweep:start -->
**Sweep progress** (every neuron in Qwen3.5-4B, measured once on a 4080 Super)

`██░░░░░░░░░░░░░░░░░░░░░░░░░░░░` 20,000 / 294,912 (6.8%)

**Stalled** since 2026-10-27 07:39 UTC. Updated 2026-10-27 16:58 UTC.
<!-- sweep:end -->

## Modes

- **Dex**: search the steer and logit lenses for free, spend a scan (12 a day) to see what a neuron does when pushed,
  and catch up to 3 a day. Rarity comes from how strongly the push moves the model compared with random directions.
  A catch is worth more the further its effect is from every neuron caught before it.
- **Daily**: one hidden neuron was pushed while the model answered three prompts. Guess layer and neuron; each guess
  shows how close its effect is to the hidden one. 15 guesses, with a layer band hint after 5 and a token hint after 10.
- **Bounties**: steer the model toward a target with as many neurons as the bounty allows, 8 entries each. The GPU judges each entry on concept match
  and coherence. The house's best single-neuron attempt is par.

## Layout

| path | what |
| --- | --- |
| `src/` | React + Tailwind client |
| `convex/` | accounts, scans, catches, dailies, bounties, the job queue (`rules.ts` holds the game numbers) |
| `worker/` | the GPU worker: pulls jobs from Convex, runs Qwen3.5-4B with HF transformers, writes results back |
| `e2e/game.mjs` | end-to-end run of every mode in a real browser |

The worker pulls jobs instead of serving requests, so it needs no open port.

## Running locally

Needs bun, uv, and a CUDA GPU with 16 GB (tested on a 4080 Super under WSL).

```sh
bun install
CONVEX_AGENT_MODE=anonymous bunx convex dev          # local backend on :3210, pushes convex/
bunx convex env set WORKER_SECRET <secret>
bunx vite --port 5173 --host 127.0.0.1
```

The lens index comes from neuron-explorer's caches (`lens_index.npz`, `steer_index.npz`, `vocab.json` in
`worker/cache/`, symlinks are fine):

```sh
cd worker && uv sync
uv run python build_neurons.py > ../data/neurons.jsonl
bunx convex import --table neurons ../data/neurons.jsonl
```

Then the worker, with `CONVEX_URL` and `WORKER_SECRET` in `worker/.env.local`:

```sh
cd worker && set -a && . ./.env.local && set +a
uv run python main.py --sweep    # --sweep: measure every neuron while no player job is waiting
```

`worker/readme_progress.py` keeps the sweep section at the top of this README current, committing and pushing it every
10 minutes until the sweep is done.

To leave it running, `./up.sh` starts Convex, Vite, the sweeping worker and the README updater as systemd user services
instead (logs in `logs/`, `./up.sh stop` to stop). They survive the shell that started them and restart on a crash;
`nohup` or `setsid` don't escape a terminal or agent session's cgroup, so those get killed when it closes.

The first start measures random-direction controls for every layer (cached in `worker/cache/`). Dailies and bounties
are created by hourly crons, and the daily generator needs the worker running.

## E2E

```sh
node e2e/game.mjs [--url http://127.0.0.1:5173]
```

Joins, scans and catches a neuron, plays today's daily to a solve, enters a bounty and waits for the judge. Writes a
screenshot per step and `report.json` to `e2e/artifacts/<timestamp>/`. On WSL without system Chrome libraries, point
`LD_LIBRARY_PATH` at a local copy.

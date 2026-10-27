# Notes for coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It applies to you too.

- `convex/` is the backend. Every public query and mutation is reachable by any player, so treat its arguments as
  hostile: validate ranges, reject non-finite numbers, and never return a hidden answer or a future puzzle.
- `convex/rules.ts` is shared with the client, so keep server-only imports out of it.
- `worker/` runs on a 16 GB GPU under WSL. Keep sweep batch sizes measured, not guessed. Past what fits in VRAM,
  WSL spills to system RAM and everything gets about 9x slower without any error.
- Verify with `node e2e/game.mjs` against a live stack (`./up.sh`), and add a step when you add a behavior.
- Unit tests are for logic where a bug is hard to see from the UI (ranks, settlement order, glitch detection, the
  sweep store). Backend: `bun run test`, which runs the real Convex functions through `convex-test`; don't hand-roll a
  fake Convex. Worker: `cd worker && uv run pytest`. Name each test after the failure it catches.
- Checks before a PR: `bunx tsc -p convex --noEmit`, `bun run build`, `bun run lint`, `bun run test`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rubik's Lab: a Three.js twisty-puzzle playground, solver and lesson app (2×2, 3×3, 4×4, 5×5, Pyraminx), built with Vite and TypeScript. `README.md` has the full architecture write-up (puzzle interface, cube model, each solver and lesson); read it before changing solver or lesson code.

## Commands

```sh
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # tsc --noEmit && vite build (this is also the type check)
npm run verify    # all four verify scripts, in order
```

There is no test framework or linter. `npm run verify` runs `tsx` scripts in `scripts/` that check solvers and lessons against random scrambles:

- Run one script: `npx tsx scripts/verify-lessons.ts` (also `verify-solver`, `verify-pyraminx`, `verify-nxn`).
- `verify-lessons.ts` takes `RUNS=<n>` (default 500) and `ONLY=<3x3|2x2|4x4|5x5|pyra>`, e.g. `ONLY=4x4 RUNS=20 npx tsx scripts/verify-lessons.ts`.
- It also fails any lesson text that uses an acronym (CFOP, F2L, OLL, PLL, …) without spelling it out, so new lesson copy has to include the expansion.

## Things to know

- Every puzzle implements `Puzzle` (`src/core/types.ts`); the view (`src/view/`) and UI (`src/main.ts`) are shared, so new puzzle behavior goes through that interface rather than into the UI.
- All N×N cubes share one model (`src/cube/model.ts`); `src/cube/puzzles.ts` builds each size from it. Don't add per-size geometry.
- Solvers run in web workers (`src/core/worker.ts`, `src/cube/workers/`) or on the main thread (`src/core/syncSolver.ts`). Verify scripts run in Node, so solver and lesson code must stay free of DOM/worker globals.
- Lessons work on the real cube state (find each piece, simulate the moves), not on canned sequences; the text, move groups and highlighted pieces are generated from that.
- `docs/plans/` holds design notes for past refactors; `dist/` is build output.

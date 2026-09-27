# Plan: restructure around one cube model

Status: proposed · 2026-09-27

## Why

The code grew puzzle by puzzle, and the folders no longer match how the pieces relate:

- `src/cube/` mixes 3×3-specific code (model, validator, Kociemba) with infrastructure every
  puzzle now uses: the worker protocol (`serveSolver`, `SolverClient`), `COLORS`/`COLOR_NAMES`,
  `parity`, and the ranking/BFS helpers. So the 2×2 solver imports from the Kociemba file.
- There are two cube models. `src/cube/model.ts` is 3×3-only; `src/nxn/model.ts` (`CubeModel`)
  is a general N×N model used by the 2×2 and 4×4. They duplicate sticker layout, move parsing,
  `simplify`, `parseAlg`, encoding and validation. `src/puzzles/cube.ts` and `makeCube` in
  `src/puzzles/nxn.ts` duplicate sticker geometry, drag options and move pads.
- `src/puzzles/pyraminx.ts` is ~500 lines holding model, solver and puzzle definition together.

How the solvers actually relate:

```
                3×3 Kociemba solver
                 │                  │
     finishes the last stage    lends ranking + BFS helpers
                 │                  │
           4×4 reduction        2×2 distance table        Pyraminx (independent)
```

Worker solvers (3×3, 4×4) share `SolverClient` + `serveSolver`; main-thread solvers
(2×2, Pyraminx) share `syncSolver`.

## Target layout

```
src/
  core/                      used by every puzzle; knows no specific puzzle
    types.ts                 Puzzle interface (was puzzles/types.ts)
    perm.ts                  permRank/Unrank, parity, BFS distance tables
    syncSolver.ts            main-thread solvers
    worker.ts                serveSolver + SolverClient + protocol types
    colors.ts                COLORS, COLOR_NAMES
  cube/                      every N×N cube, one model
    model.ts                 CubeModel(n): stickers, notation, orbits, validation
    puzzles.ts               makeCube(n) → cube2, cube3, cube4 (…cube5)
    kociemba/solver.ts       3×3 two-phase search
    solve2.ts                2×2 distance table
    reduce.ts                N≥4 reduction to a 3×3
    workers/3x3.worker.ts
    workers/bigcube.worker.ts   reads N from state length (6·N²)
  pyraminx/
    model.ts, solver.ts, puzzle.ts
  view/                      unchanged
  main.ts
```

Dependency rule: everything may depend on `core/`; `core/` depends on nothing puzzle-specific;
`cube/reduce.ts` depends on `cube/kociemba/`; `cube/solve2.ts` depends only on `core/perm.ts`.

## Steps

Each step is its own commit and must leave `npm run verify`, `npm run build` and the
headless browser check (scramble + solve + playback on every puzzle, no console errors) green.

### 1. Pure moves (no behaviour change)

- Create `src/core/` and move into it: `puzzles/types.ts`, `puzzles/syncSolver.ts`,
  `cube/serveSolver.ts` + `cube/solverClient.ts` (merged as `worker.ts`), `COLORS`/`COLOR_NAMES`,
  and `parity` + `permRank`/`permUnrank`/`buildPruning` (as `perm.ts`).
- Move `src/nxn/*` into `src/cube/` (`solver2.ts` → `solve2.ts`, `reduction.ts` → `reduce.ts`,
  worker into `cube/workers/`), and `src/cube/solver.ts` → `src/cube/kociemba/solver.ts`.
- Split `puzzles/pyraminx.ts` into `pyraminx/{model,solver,puzzle}.ts`.
- Update imports, README and the verify scripts.

Risk: low. Done when it type-checks and every check passes unchanged.

### 2. Make `CubeModel` handle odd sizes and find orbits itself

- Notation for odd N and deeper layers: `M`/`E`/`S`, `3R`, `3Rw`, and a name for every
  single layer so dragging any layer works. Use the general `nR` / `nRw` form rather than
  more special cases.
- Replace the fixed `corners` / `wings` / `centers` lists with orbits computed generically:
  group piece positions by their sorted absolute coordinates (e.g. 5×5: `(4,4,4)` corners,
  `(4,4,0)` midges, `(4,4,2)` wings, `(4,2,2)` x-centers, `(4,2,0)` t-centers, `(4,0,0)` fixed
  centers). Each orbit records whether its pieces can flip in place. From 6×6 on, oblique
  centers split into two mirror-image orbits with the same pattern, which needs a chirality
  check; note it, don't build it yet.
- Validation per orbit. Odd N takes its orientation from the fixed centers (like the 3×3);
  even N keeps the DBL-corner rule in `toFaces`.
- Add a check to `scripts/verify-nxn.ts` that `CubeModel(3)` matches `src/cube/model.ts`
  exactly: same sticker order, same permutation for every 3×3 move (including slices, wide
  turns and rotations), same encoding, same verdict from both validators on scrambled and
  broken states.

Known today: `CubeModel(5)` rejects `M`/`3R`, can't name the middle layer, and wrongly
rejects a legally scrambled 5×5 (it treats midges as unflippable wings). This step fixes all three.

### 3. Switch the 3×3 onto `CubeModel(3)`

- Build `cube3` with `makeCube(3)` plus its Kociemba worker, M/E/S move pad and locked centers.
- Delete `src/cube/model.ts`, most of `src/cube/validate.ts` and `src/puzzles/cube.ts`
  (~250 lines). Kociemba already takes its moves via `initSolver(faceMove)`, so it only
  needs the new model's permutations.
- Extra check: an existing `#3x3:…` share link and a bare 54-letter legacy link still load
  the same state.

Risk: medium (touches the 3×3's solver input and share links). Step 2's equivalence check is
what makes this safe.

### 4. Generalize the reducer

- `Reducer4` → `Reducer(n)`: solve every orbit that isn't part of the 3×3 with 3-cycles, fix
  wing parity first, then hand corners, midges (odd N) and fixed centers to Kociemba.
- Classify commutators by orbit instead of by number of moved stickers.
- One `bigcube.worker.ts` for all N ≥ 4, caching one reducer per N.

### 5. Add the 5×5

- `makeCube(5)` + a switcher entry. Expect ~250–300-move solutions.
- Scale the camera's `minDistance`/`maxDistance` (hardcoded 6.5–18 in `PuzzleView`) with the
  puzzle; the 5×5 home view sits right at 18.
- Generate the switcher tabs from `PUZZLES` (name + icon) instead of hardcoding them in
  `index.html`. Consider a size picker for N×N, since five tabs are tight on phones.

## Out of scope

- Shorter 4×4/5×5 solutions (needs large table-based phase solvers).
- Moving the 2×2 table build off the main thread (~130 ms once per page load).
- Shipping precomputed commutator tables.

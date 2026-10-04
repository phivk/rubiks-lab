# Rubik's Lab

A 3D twisty-puzzle playground and solver for the **2×2**, **3×3**, **4×4** and **5×5 cubes** and the **Pyraminx**. Turn the puzzle by dragging it, paint in a real puzzle's state, and step through the solution. On the 3×3, the **Learn** tab teaches a method on your own scramble, one explained step at a time: the beginner's method, **CFOP**, **Roux** or **ZZ**.

```sh
npm install
npm run dev      # http://localhost:5173
npm run verify   # checks every solver against random scrambles
npm run build
```

## How it fits together

Each puzzle implements the `Puzzle` interface (`src/core/types.ts`): sticker geometry, pieces, moves, validation, a solver and UI hints. The 3D view and UI are shared by all puzzles.

- `src/core/` is what every puzzle shares: the `Puzzle` types, cube colors, permutation helpers (parity, ranking, breadth-first distance tables), and the two ways of running a solver — on the main thread (`syncSolver.ts`) or in a web worker (`worker.ts`: `serveSolver` on the worker side, `SolverClient` on the page).
- `src/cube/` holds every N×N cube, all on one model (`model.ts`): stickers and moves derived geometrically (`R`, `Rw`, `2R`, `3Rw`, `M`, `x`, …), pieces grouped into orbits by their coordinates (corners, midges, wings, each kind of center), and a validator that checks each orbit. `puzzles.ts` builds the 2×2, 3×3, 4×4 and 5×5 from it. Odd cubes take their orientation from the fixed centers; even cubes have none, so their solvers take it from the DBL corner.
  - 3×3: a Kociemba two-phase solver (`kociemba/solver.ts`) in a worker, which finds a solution in milliseconds, keeps shortening it, and proves it optimal when its search finishes.
  - 2×2 (`solve2.ts`): a breadth-first distance table over all 3.67M states (DBL fixed, U/R/F turns), so solutions are always optimal and scrambles are random-state.
  - 3×3 lessons (`beginner.ts`): the layer-by-layer beginner's method in seven stages (white cross, white corners, middle layer, yellow cross, yellow edges, corner spots, corner twists). It works on the actual state: it finds each piece, picks the case and simulates the moves, so each step's text, move groups ("Turn the top", "R U R' U' ×3") and highlighted pieces match the cube. The cross edges come from a small breadth-first search; everything after uses the standard algorithms. Lessons average ~155 moves in ~20 steps.
  - CFOP, Roux and ZZ lessons (`cfop.ts`, `roux.ts`, `zz.ts`) share a toolkit (`lessonKit.ts`): pieces found by color, and small searches that track one sticker per piece. Blocks, pairs and the like are the cheapest run of moves or "macros" (conjugates such as `R U R'`) that leave the solved pieces alone, so F2L pairs come out as intuitive pair-and-insert moves. Algorithm steps (`algs.ts`: 57 OLL, 21 PLL; shared by `lastLayer.ts`) find their case by trying each algorithm after each turn of the top.
    - CFOP: shortest cross (distance table over the four edges), F2L pair by pair, full OLL and PLL. ~60 moves.
    - Roux: first block and second block (a square, then a pair; the second with `U R r M` only), two-look CMLL, then the last six edges with `M U`: orientation, the left/right edges, the M slice. ~59 moves.
    - ZZ: edge orientation (a distance table over flip patterns) and the line, both blocks with `L U R`, then OCLL (edges are already oriented) and PLL. ~57 moves.
  - 4×4 and up (`reduce.ts`, one `bigcube` worker for every size): reduce to a 3×3. It fixes parity first, then solves every orbit a 3×3 doesn't have (wings, x- and t-centers) with pure 3-cycle commutators found by search at startup. Wings go home on an even cube and pair up with their edge's midge on an odd one. The corners (plus midges and fixed centers on an odd cube) go to the Kociemba solver. Solutions are correct but long (~170 moves on the 4×4, ~240 on the 5×5), not optimal.
- `src/pyraminx/` is the Pyraminx. Pieces and stickers come from barycentric cuts of a tetrahedron (`model.ts`). The solver (`solver.ts`) fixes the tips directly, then finds the optimal core solution with a meet-in-the-middle search (depth 6 + 5 ≥ God's number of 11), so every solution is optimal.
- `src/view/PuzzleView.ts` is the Three.js scene; its zoom range scales with each puzzle's size. Drag-to-turn follows the pointer and snaps to the nearest quarter turn (cube) or third of a turn (Pyraminx).
- `src/view/net.ts` draws the unfolded 2D map as SVG. Cubes also have a ring map (`src/cube/rings.ts`, drawn by `src/view/rings.ts`): each layer is a circle and each sticker a dot where its two layers' circles cross, so a turn slides the dots along their circle.
- The right panel has a **Solve** tab (shortest solution) and, for puzzles with `guides`, a **Learn** tab with a method picker. A lesson plays like a solution but pauses after each step, dims all but the pieces the step is about, and follows along when you make its next move yourself (a half turn may be made as two quarter turns). The **Flip** button in the top bar turns the whole cube upside down (`z2`), which dragging can't do.
- `src/main.ts` builds the puzzle tabs from `PUZZLES` and handles UI state, a per-puzzle session, the move queue, playback, keyboard shortcuts, and share links (`#pyra:…` / `#3x3:…` / `#5x5:…` in the URL hash).

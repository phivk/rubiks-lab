# Rubik's Lab

A 3D twisty-puzzle playground and solver for the **2×2**, **3×3** and **4×4 cubes** and the **Pyraminx**. Turn the puzzle by dragging it, paint in a real puzzle's state, and step through the solution.

```sh
npm install
npm run dev      # http://localhost:5173
npm run verify   # checks every solver against random scrambles
npm run build
```

## How it fits together

Each puzzle implements the `Puzzle` interface (`src/core/types.ts`): sticker geometry, pieces, moves, validation, a solver and UI hints. The 3D view and UI are shared by all puzzles.

- `src/core/` is what every puzzle shares: the `Puzzle` types, cube colors, permutation helpers (parity, ranking, breadth-first distance tables), and the two ways of running a solver — on the main thread (`syncSolver.ts`) or in a web worker (`worker.ts`: `serveSolver` on the worker side, `SolverClient` on the page).
- `src/cube/` holds the cubes:
  - the 3×3 (`puzzle3.ts`) on a 54-facelet model (`model3.ts`) with moves derived geometrically and a reachability validator (`validate3.ts`)
  - a Kociemba two-phase solver (`kociemba/solver.ts`) that runs in a worker, finds a solution in milliseconds, keeps shortening it, and proves it optimal when its search finishes
  - the 2×2 and 4×4 (`puzzles.ts`) on a generic N×N model (`model.ts`, moves like `R`, `Rw`, `2R`, `x`). Neither has fixed centers, so the solvers take their orientation from the DBL corner.
    - 2×2 (`solve2.ts`): a breadth-first distance table over all 3.67M states (DBL fixed, U/R/F turns), so solutions are always optimal and scrambles are random-state.
    - 4×4 (`reduce.ts`): a worker reduces it to a 3×3. It fixes parity first, then solves centers and edge wings with pure 3-cycle commutators found by search at startup, and hands the remaining corners to the Kociemba solver. Solutions are correct but long (~170 moves), not optimal.
- `src/pyraminx/` is the Pyraminx. Pieces and stickers come from barycentric cuts of a tetrahedron (`model.ts`). The solver (`solver.ts`) fixes the tips directly, then finds the optimal core solution with a meet-in-the-middle search (depth 6 + 5 ≥ God's number of 11), so every solution is optimal.
- `src/view/PuzzleView.ts` is the Three.js scene. Drag-to-turn follows the pointer and snaps to the nearest quarter turn (cube) or third of a turn (Pyraminx).
- `src/view/net.ts` draws the unfolded 2D map as SVG.
- `src/main.ts` handles UI state, a per-puzzle session, the move queue, playback, keyboard shortcuts, and share links (`#pyra:…` / `#3x3:…` / `#4x4:…` in the URL hash).

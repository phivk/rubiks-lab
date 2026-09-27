# Cube Solver

A 3D twisty-puzzle playground and solver for the **3×3 cube** and the **Pyraminx**. Turn the puzzle by dragging it, paint in a real puzzle's state, and step through the solution.

```sh
npm install
npm run dev      # http://localhost:5173
npm run verify   # checks both solvers against random scrambles
npm run build
```

## How it fits together

Each puzzle implements the `Puzzle` interface (`src/puzzles/types.ts`): sticker geometry, pieces, moves, validation, a solver and UI hints. The 3D view and UI are shared by both puzzles.

- `src/puzzles/cube.ts` wraps the 3×3 engine in `src/cube/`:
  - a 54-facelet model with moves derived geometrically
  - a reachability validator
  - a Kociemba two-phase solver in a web worker, which finds a solution in milliseconds, keeps shortening it, and proves it optimal when its search finishes
- `src/puzzles/pyraminx.ts` is the whole Pyraminx. Pieces and stickers come from barycentric cuts of a tetrahedron. The solver fixes the tips directly, then finds the optimal core solution with a meet-in-the-middle search (depth 6 + 5 ≥ God's number of 11), so every solution is optimal.
- `src/view/PuzzleView.ts` is the Three.js scene. Drag-to-turn follows the pointer and snaps to the nearest quarter turn (cube) or third of a turn (Pyraminx).
- `src/view/net.ts` draws the unfolded 2D map as SVG.
- `src/main.ts` handles UI state, a per-puzzle session, the move queue, playback, keyboard shortcuts, and share links (`#pyra:…` / `#3x3:…` in the URL hash).

# Cube Solver

A 3D Rubik's Cube playground and solver. Turn the cube by dragging it, paint in a real cube's state, and step through the solution.

```sh
npm install
npm run dev      # http://localhost:5173
npm run verify   # checks the solver against random scrambles
npm run build
```

## How it fits together

- `src/cube/model.ts`: a 54-facelet model. Every move (faces, slices, wide turns, rotations) is derived geometrically from sticker positions.
- `src/cube/validate.ts`: checks that a painted state is reachable (sticker counts, real pieces, twist, flip, parity) and explains what's wrong.
- `src/cube/solver.ts`: a Kociemba two-phase solver with no dependencies. It finds a solution in milliseconds, then keeps shortening it. When its search finishes it has proven the solution optimal (typical for short scrambles). Otherwise it reports the best solution found within the time budget.
- `src/cube/solver.worker.ts`: runs the solver off the main thread and double-checks every solution before returning it.
- `src/view/CubeView.ts`: the Three.js scene. Drag-to-turn follows the pointer and snaps to the nearest quarter turn.
- `src/main.ts`: UI state, move queue, playback, keyboard shortcuts, share links (the state lives in the URL hash).

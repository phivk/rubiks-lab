# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Learners holding a real, scrambled puzzle. They paint its state into the app, then follow a lesson, one explained step at a time, mirroring the moves on the physical cube. People who just want the answer are also served, through the Solve tab's shortest solution, but learning leads. Used on both phones and desktop.

## Product Purpose

A 3D twisty-puzzle playground, solver and teacher for the 2×2, 3×3, 4×4 and 5×5 cubes and the Pyraminx. Turn the puzzle by dragging, paint in a real puzzle's state, and either step through the shortest solution (Solve tab) or learn a method on your own scramble (Learn tab). Success is a learner who understands why each step is made and ends up with a solved puzzle in their hands.

## Positioning

Lessons are generated from the user's actual puzzle state: each step's text, move groups and highlighted pieces match what is on their cube, rather than a fixed tutorial for an average scramble. A lesson dims everything but the pieces the step is about and follows along when the learner makes the next move themselves.

## Operating Context

The user has a physical puzzle beside the screen and alternates between looking at the app and turning the cube. They paint in colors from the real puzzle, drag the 3D model, flip the whole cube (the Flip button, `z2`), and share a scramble by URL.

## Capabilities and Constraints

- Puzzles: 2×2, 3×3, 4×4, 5×5, Pyraminx, all behind one shared 3D view and UI.
- Solve tab: shortest solution (optimal on the 2×2, 3×3 and Pyraminx; long but correct on the 4×4 and 5×5).
- Learn tab: on the 3×3, beginner's method, CFOP, Roux or ZZ; on other puzzles a beginner's method (layer by layer on the 2×2 and Pyraminx, reduction on the 4×4 and 5×5).
- Views of the puzzle state: 3D, unfolded net, and ring map for cubes.
- Drag-to-turn snaps to the nearest quarter turn (cube) or third of a turn (Pyraminx).
- Scrambles are shareable as URL-hash links (`#pyra:…`, `#3x3:…`, `#5x5:…`); there is no backend and there are no accounts.
- Works on phones and desktop; the puzzle tabs scroll sideways on narrow screens.
- Solvers run in web workers or on the main thread, so the solver and lesson logic stays free of DOM dependencies.
- Move notation and method acronyms (CFOP, F2L, OLL, PLL, …) must be spelled out in lesson text.
- Open decision: whether the redesign changes the set of Learn methods or the tab structure.

## Brand Commitments

- Name: Rubik's Lab.
- The About dialog and the "Where the methods come from" link at the bottom of the Learn tab credit the authors of the tutorials the beginner lessons follow; these stay.

## Evidence on Hand

- Working solvers and lessons for every puzzle, checked against random scrambles by `npm run verify`.
- No testimonials, user numbers or press; none should be invented.

## Product Principles

1. Teach on the learner's own cube: explanation follows their state, not a generic example.
2. The physical puzzle is the source of truth: the app mirrors it and never makes the learner guess which piece or face a step means.
3. Show the next move, then get out of the way: the learner's attention belongs on their hands as much as on the screen.
4. Credit where the methods come from.
5. Stay serverless and shareable: state lives in the URL, nothing to sign up for.

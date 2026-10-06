---
name: Rubik's Lab
description: A dark, glass-paneled workbench where the 3D puzzle is the only saturated thing on screen.
colors:
  accent-violet: "#8f7bff"
  accent-sky: "#5ec8ff"
  accent-violet-soft: "rgba(143, 123, 255, 0.16)"
  night-bg: "#0b0d12"
  night-bg-raised: "#11141b"
  stage-glow: "#1a1e2b"
  panel-solid: "#151821"
  panel-glass: "rgba(20, 23, 31, 0.72)"
  ink: "#eef0f5"
  ink-2: "#a4a9b8"
  ink-3: "#6b7183"
  hairline: "rgba(255, 255, 255, 0.07)"
  hairline-strong: "rgba(255, 255, 255, 0.12)"
  chip: "rgba(255, 255, 255, 0.05)"
  chip-hover: "rgba(255, 255, 255, 0.09)"
  good-mint: "#3ddc97"
  bad-coral: "#ff5d73"
  warn-amber: "#ffc857"
  sticker-red: "#e02a3c"
  sticker-white: "#f4f4ef"
  sticker-green: "#14a85a"
  sticker-yellow: "#ffd21f"
  sticker-blue: "#2166e6"
  sticker-orange: "#ff7b1c"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "0.08em"
  move:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  xs: "5px"
  sm: "10px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  xl: "24px"
components:
  button-default:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "38px"
  button-default-hover:
    backgroundColor: "{colors.chip-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "36px"
  button-primary-soft:
    backgroundColor: "{colors.accent-violet-soft}"
    textColor: "#d6ceff"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "38px"
  button-solve:
    backgroundColor: "{colors.accent-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "16px"
  button-play:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.night-bg}"
    rounded: "{rounded.pill}"
    size: "46px"
  segmented-control:
    backgroundColor: "rgba(0, 0, 0, 0.3)"
    rounded: "12px"
    padding: "4px"
  segmented-control-active:
    backgroundColor: "{colors.chip-hover}"
    textColor: "{colors.ink}"
    rounded: "9px"
    height: "34px"
  move-key:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    typography: "{typography.move}"
    rounded: "8px"
    height: "34px"
  move-chip-current:
    backgroundColor: "{colors.accent-violet-soft}"
    textColor: "#ffffff"
    typography: "{typography.move}"
    rounded: "8px"
    padding: "6px 8px"
  panel:
    backgroundColor: "{colors.panel-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  dialog:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Rubik's Lab

## Overview

**Creative North Star: "The Night Workbench"**

A dim bench with one lit object on it. The 3D puzzle fills the whole viewport, lit by a soft studio environment, and everything else is a tool laid beside it: frosted glass panels left and right, a floating puzzle switcher at top center, small chips and keys within reach. The interface is calm, focused and dark. Its chrome is deliberately low-contrast gray-blue, so the six sticker colors are the only fully saturated things on screen.

Controls are soft and tactile: translucent fills that brighten on hover, a small press-in on click, rounded corners, and thin hairlines instead of heavy borders. Move notation is set in a monospace, like labels on a tool. One violet-to-sky gradient is reserved for the Solve action and the progress bar; it is the only decoration the system allows itself.

**Key Characteristics:**
- The puzzle is the hero. UI is translucent glass over a dark radial-gradient stage, never competing with the stickers.
- Near-black, slightly blue neutrals (`#0b0d12` to `#151821`); no pure black or white in the chrome.
- One accent family (violet to sky), used for state (current move, active field, focus) and a single gradient.
- Moves and algorithms in JetBrains Mono; everything else in Inter.
- Hairline borders (7 to 12% white) and tonal fills, with one soft drop shadow under panels.
- Sticker colors appear in the chrome only as identity (the 3×3 logo, the empty-state dots, color names in lesson text, paint swatches).

## Colors

A near-black blue ground with a single violet-to-sky accent and the cube's own six colors as the only saturated notes.

### Primary
- **Workbench Violet** (#8f7bff): the accent. Focus rings, the active field border, the current move chip and lesson stage, the first stop of the Solve gradient, the progress fill.
- **Skylight Blue** (#5ec8ff): the accent's cool partner. The last stop of the Solve gradient and progress bar, and the link color in the About dialog's sources.

### Secondary
- **Solved Mint** (#3ddc97): success only. The "Solved" badge, the optimal-solution badge, completed lesson stages, and color counts that are complete in Paint mode.
- **Warning Amber** (#ffc857): stale and caution states: a solution that no longer matches the cube, scan warnings.
- **Error Coral** (#ff5d73): invalid states: bad algorithm input, over-count paint colors, impossible-cube status.

### Tertiary (sticker colors)
- **Sticker Red** (#e02a3c), **Sticker White** (#f4f4ef), **Sticker Green** (#14a85a), **Sticker Yellow** (#ffd21f), **Sticker Blue** (#2166e6), **Sticker Orange** (#ff7b1c): the cube's colors, as in the logo and the browser icon. The in-app puzzle can show "Typical" or "Bright" blues and greens, chosen by the user; these hexes are the brand set.

### Neutral
- **Night Ground** (#0b0d12): page background and the theme color. Under it sits a radial glow, **Stage Glow** (#1a1e2b), centered on the puzzle.
- **Raised Night** (#11141b): a slightly lifted dark.
- **Glass Panel** (rgba(20, 23, 31, 0.72)): side panels and the puzzle switcher, always with a backdrop blur.
- **Solid Panel** (#151821): dialogs, toasts and the small count badges, where translucency would hurt legibility.
- **Ink** (#eef0f5): primary text. **Ink 2** (#a4a9b8): body copy in panels and secondary controls. **Ink 3** (#6b7183): eyebrow labels, hints and disabled affordances.
- **Hairline** (rgba(255, 255, 255, 0.07)) and **Hairline Strong** (rgba(255, 255, 255, 0.12)): all borders and dividers.
- **Chip** (rgba(255, 255, 255, 0.05)) and **Chip Hover** (rgba(255, 255, 255, 0.09)): the default fill for any small control.

### Named Rules
**The Stickers-Are-Loudest Rule.** No chrome element is more saturated than a sticker. The accent is a tint (16% violet) or a thin line; a full-strength violet fill is reserved for the Solve button and the current stage number.

**The Tonal Layering Rule.** Depth comes from white at 5 to 12% alpha over dark, never from lighter solid grays or colored fills.

## Typography

**Display and Body Font:** Inter (with system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo, monospace), weights 500 to 600

**Character:** Inter is neutral and tightly tracked for headings, so the UI reads as a tool rather than a brand. JetBrains Mono is the voice of notation: every move, algorithm, step counter and speed value.

### Hierarchy
- **Display** (700, 34px, 1, -0.03em, tabular numbers): the move count of a solution, the single big number on the page.
- **Headline** (700, 17 to 18px, 1.25, -0.01em): lesson step titles, dialog titles, the Solve button label.
- **Title** (650, 15px, -0.01em): the brand name and scan prompts.
- **Body** (400 to 550, 13 to 14px, 1.45): panel copy, lesson text, button labels. Lesson text is set in Ink 2 with emphasis in Ink.
- **Label** (650, 11px, 0.08em, uppercase): eyebrows above sections (Moves, History, Map), in Ink 3.
- **Move** (JetBrains Mono, 600, 12 to 14px): move keys, move chips, history, inline `code`.

### Named Rules
**The Notation Is Mono Rule.** Anything the learner will perform with their hands (a move, an algorithm, a count) is monospaced; anything explaining it is Inter.

**The Quiet Label Rule.** Uppercase tracked labels are only for 11px section eyebrows; headings are sentence case.

## Layout

A three-column app shell: a 340px left panel (tools), the full-viewport 3D stage behind everything, and a 340px right panel (Solve and Learn). Panels float over the stage with 16px margins and scroll internally, aligned to the top. The top bar is 60px, transparent, and holds the brand, the puzzle switcher (absolutely centered), and icon actions. Panel contents stack in a flex column with 14px gaps; small rows use 5 to 8px gaps.

At 1100px the side panels narrow to 300px. At 860px the layout becomes a single column: the stage turns into a sticky 46vh block at the top (min 300px), the right panel comes before the left, panels lose their internal scroll, the puzzle tabs scroll sideways, and the brand name and non-essential icons drop out.

Density is compact and consistent: 34 to 38px controls, 10 to 16px paddings, 11 to 14px type.

## Elevation & Depth

Hybrid: tonal layering with one soft shadow. Panels sit above the stage as translucent glass (blurred, 1.3 saturation) with a hairline border and a single deep shadow; inside them, depth is flat and conveyed by lighter fills and hairlines.

### Shadow Vocabulary
- **Panel lift** (`box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255, 255, 255, 0.04) inset`): panels, dialogs and toasts.
- **Active control** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4)`): the selected segment in any segmented control.
- **Solve glow** (`box-shadow: 0 10px 30px -10px rgba(120, 110, 255, 0.8), 0 1px 0 rgba(255, 255, 255, 0.35) inset`): the Solve button only.
- **Current-move halo** (`box-shadow: 0 0 0 3px rgba(143, 123, 255, 0.15)`): the move chip being performed.

### Named Rules
**The One Glow Rule.** Only the Solve button, the solved dot and the "searching" dot may glow. Nothing else gets a colored shadow.

## Shapes

Soft rounded rectangles at a handful of fixed radii: 20px for panels and dialogs, 14 to 16px for the Solve button, 10px for buttons and inputs, 8 to 9px for keys, chips and segments, 5px for history tokens. Pills (99px) are reserved for badges and the stage hint; the play button is the only full circle. Borders are 1px hairlines. Focus is a 2px violet outline with a 2px offset. Icons are 16 to 18px, 2px stroke, rounded caps and joins, no fill.

## Components

### Buttons
- **Shape:** gently rounded (10px radius), 38px tall; top-bar buttons are 36px.
- **Default:** Chip fill, hairline border, medium-weight 13.5px label, optional leading icon.
- **Hover / Active:** fill moves to Chip Hover and the border to Hairline Strong; pressed state scales to 0.97. Disabled fades to 35%.
- **Ghost:** transparent, Ink 2 label; hover adds the chip fill and lifts the text to Ink. Used for the top bar, transport and Copy.
- **Primary-soft:** 16% violet fill, a violet hairline and a pale violet label; used for Scramble.
- **Solve:** the one hero button. A 135° gradient from violet through periwinkle to sky, white text, a 17px bold label with a 12px subtitle, a violet glow, and a shimmer sweep while the solver is working.
- **Play:** a 46px circle, Ink fill with Night text, the only filled-neutral control.

### Segmented controls
- **Style:** a dark inset track (30% black, hairline, 12px radius) holding equal-width buttons; used for Turn/Paint, Solve/Learn, the puzzle switcher, method picker and map style.
- **State:** the active segment takes the Chip Hover fill, Ink text and a 1px shadow. Inactive segments are Ink 2.
- **Variants:** the puzzle switcher is glass (translucent with blur) and floats at the top center; small map and color-kind switchers use 11px text.

### Move keys and chips
- **Move key:** a mono 13px key, 34px tall, 8px radius, with a 2px bar across the top in the color of the face it turns. A pad is six per row.
- **Move chip:** the solution's moves, mono 14px. Done chips fade to 38%; the current chip takes the violet soft fill, a violet border, white text and a halo.
- **History token:** a 12px mono token, 5px radius; the latest one is brighter.

### Panels and containers
- **Corner style:** 20px.
- **Background:** Glass Panel with a 18px blur; dialogs and toasts use Solid Panel.
- **Border:** 1px Hairline.
- **Internal padding:** 16px; dialogs 24px.
- **Insets:** the Map holds the net or ring view in a 30% black recess with a hairline and 12px radius.

### Inputs / Fields
- **Style:** a 38px, 10px-radius field with a 25% black fill, a hairline border, and mono text for algorithm entry.
- **Focus:** the border shifts to 60% violet; no glow.
- **Error:** a 12px coral message beneath, with no change to the field.

### Navigation
- **Style:** there is no nav; the puzzle switcher is the page's navigation (see Segmented controls). On mobile it scrolls sideways rather than wrapping.

### Lesson stage list (signature)
A numbered list of the steps in a method. Each row has a 22px circle number (Chip Hover fill) and a name with a faint move count, with the stage's goal in Ink 2 beneath. The current row takes the soft violet fill and a violet number; completed rows turn their number mint with a tinted fill.

### Sticker maps (signature)
The unfolded net and the ring view draw each sticker as a 4px-stroked rounded cell in its true color on a dark recess. Cells in editable mode light up with a white stroke on hover; during a turn the layers that don't move dim to 40%.

## Do's and Don'ts

### Do:
- **Do** keep chrome in the near-black blue neutrals and let the sticker colors be the only saturated elements.
- **Do** build depth with white-alpha fills (5% rest, 9% hover, 12% strong) and 7 to 12% hairlines.
- **Do** set every move, algorithm and count in JetBrains Mono, and everything else in Inter.
- **Do** use the violet soft fill (16%) for "current" states, and keep the full gradient for Solve and progress.
- **Do** give every interactive element a 2px violet focus outline with a 2px offset.
- **Do** keep controls at 34 to 38px tall, with a press-in (scale 0.97) on click.
- **Do** honor `prefers-reduced-motion`, and keep other motion short (120 to 400ms).

### Don't:
- **Don't** put solid light or colored fills on panels; panels are translucent glass over the stage.
- **Don't** use pure black or pure white in the chrome (the Play button's Ink fill is the one light exception).
- **Don't** add a second accent hue; use mint, amber and coral only for success, caution and error.
- **Don't** add decorative glows, gradients or illustrations beyond the Solve button, progress fill and the three-dot empty state.
- **Don't** compete with the 3D puzzle for attention, or cover the center of the stage with UI.
- **Don't** write headings in uppercase; only 11px eyebrows are tracked caps.

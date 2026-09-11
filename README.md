# Sort Showdown

An interactive browser game built around a hand-written JavaScript quicksort, where you race an automated opponent to sort dice into ascending order.

**[Play it here »](https://adherlycisneros.github.io/sort-showdown/)**

Built with vanilla HTML, SCSS and JavaScript — no framework, no build step at deploy time.

## Features

- **Three opponents** — Blake (Easy), Star (Medium, the default) and Logan (Hard). Difficulty changes the opponent's speed and nothing else.
- **Two modes** — race over nine dice or six.
- **Live opponent progress** — a counter and progress bar show how far along the opponent is, and the result tells you your winning margin.
- **Play by mouse, finger or keyboard** — drag a die, or move it with the arrow keys; there is a pick-up/place interaction for screen readers that never requires dragging.
- **Responsive** — a single-row board on wide screens, a 3×3 board on tablets and phones, and its own side-by-side composition in landscape.
- **Respects `prefers-reduced-motion`** — the animated backdrop becomes a still image and entrance animations are skipped, without losing any state feedback.
- **Degrades gracefully** — if the background video cannot autoplay (iOS Low Power Mode, for instance), a static backdrop takes its place and no stray media controls appear.

## How to play

1. Pick an opponent, then press **START**.
2. Put your dice in order, lowest to highest, before the opponent finishes.
3. Drag a die, or focus one and use **←/→**, **Home**/**End**. Or press **Enter**/**Space** to pick a die up and again on another to place it there; **Escape** cancels.
4. Press **DONE** to submit. A wrong order keeps the round running, so you can correct it and try again.
5. **6 DICE** / **9 DICE** switches mode, and **MENU** returns to opponent selection.

## How it works

`quickSort` in [`src/scripts/dice.js`](src/scripts/dice.js) is a recursive three-way-partition quicksort. It is not animated step by step — it computes the target order for the round, and two things are measured against that result: whether your board matches when you press DONE, and where the opponent is heading.

The opponent is a timer, not a second solver. After a flat 1200 ms pause it moves one die into place per tick, so a round takes `1200 ms + dice × per-die delay`. The per-die delay is the only thing difficulty changes: 2400 ms for Blake, 1450 ms for Star, 900 ms for Logan.

Everything a round owns — its timers, its SortableJS instance, its dice — hangs off a single `round` object with one place to start it and one place to tear it down, so switching modes or opponents mid-race can never leave earlier work mutating the board.

## Accessibility

- Opponents are native radio buttons in a `fieldset`, so selection, click targets and arrow-key navigation are all the browser's.
- Each die is a real `<button>` carrying its own artwork and a text name that includes its value and position ("Die showing 5, position 3 of 9").
- Full keyboard reordering, plus an activation-based pick-up/place path that works in screen readers, where drag-and-drop does not.
- Round results move focus to the result heading; submission feedback and round changes are announced through live regions.
- Visible focus states, a minimum 44×44 px touch target on every control, and text contrast checked against the artwork actually behind it.

## Built with

| | |
|---|---|
| Markup & styling | HTML, SCSS compiled to CSS |
| Logic | Vanilla JavaScript (no framework) |
| Drag & drop | [SortableJS](https://github.com/SortableJS/Sortable) 1.15.7, pinned from a CDN with subresource integrity |
| Tooling | [Sass](https://sass-lang.com/) — the only dependency |
| Hosting | GitHub Pages |

## Local setup

```bash
git clone https://github.com/adherlycisneros/sort-showdown.git
cd sort-showdown
npm install
```

Compile the stylesheet once, or rebuild it as you edit:

```bash
npm run build:css     # one-off build
npm run watch:css     # rebuild on save
```

Then serve the folder over HTTP — opening `index.html` from the filesystem will not work, because the browser blocks the manifest and media:

```bash
npx serve .
```

Any static server is fine, but it must support **HTTP range requests** (`206 Partial Content`). iOS Safari refuses to play video from a server that does not, which looks exactly like a broken background.

## Project structure

```
index.html                 the whole UI, both screens
src/
  scripts/dice.js          game logic: quicksort, round lifecycle, input, a11y
  styles/styles.scss       source styles
  styles/styles.css        compiled output, committed and served directly
  assets/                  dice and opponent artwork, backdrop image and video
.nojekyll                  serve the files as-is on GitHub Pages
```

## Deployment

GitHub Pages serves this repository as a static site at a project sub-path, so every asset URL is relative and the compiled CSS is committed rather than built on deploy. `.nojekyll` skips Jekyll processing, which this project has no use for.

## License

MIT — see [LICENSE](LICENSE).

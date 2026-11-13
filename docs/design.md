# juanalmaraz.dev design guide

The site is a reading-first portfolio for a backend engineer.
It shows backend work by running it: a live API, a live request log and a live status, all real.
Every visual decision below serves two things: easy reading and visible engineering.

## Principles

- Reading comes first: one column of text, generous line height, no decoration that competes with content.
- Each content type looks different at a glance: its own color, icon and component.
- Backend is shown, not described: the terminal, the API console and the status are real data.
- Light mode is the default; dark mode is a manual toggle, never automatic.
- Motion is small (250 ms or less) and always disabled under `prefers-reduced-motion`.
- English only, with `lang="en"` so browsers offer translation.

## Color

All colors are CSS custom properties on `:root`; dark values apply under `:root[data-mode="dark"]`.
The stored preference lives in `localStorage` under `mode`; with no stored value the page is light.

### Neutrals and semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fbfbfa` | `#141518` | Page background |
| `--fg` | `#17191c` | `#e9ebee` | Primary text |
| `--muted` | `#5f6670` | `#9ba2ac` | Secondary text |
| `--faint` | `#8a9099` | `#6e757f` | Meta, dates, hints |
| `--line` | `#e2e4e7` | `#2a2d32` | Borders, dividers |
| `--soft` | `#f1f2f3` | `#1d1f23` | Chip and pill fills, subtle panels |
| `--accent` | `#c2410c` | `#fb8a4c` | Role line, links, focus ring |
| `--ok` | `#1f8a4c` | `#4cc985` | Status operational, 200 |
| `--warn` | `#b7791f` | `#f2b84b` | Degraded, lag |
| `--down` | `#c53030` | `#f07171` | Outage, 5xx |

### Section colors

Every section, its rail entry, its palette results and its chips use the same hue.

| Section | Light | Dark |
|---|---|---|
| Experience | `#2457c5` | `#86a8ff` |
| Projects (backend group) | `#c2410c` | `#fb8a4c` |
| Projects (engineering group) | `#0e7c86` | `#4cc3cc` |
| Education | `#2f7a4f` | `#7cc79a` |
| Writing | `#7a3fb8` | `#c49af0` |
| About | `#b4366f` | `#f07aae` |

### Graphite (terminal surfaces)

Used by code blocks and the status tooltip; identical in both modes.

| Token | Value | Use |
|---|---|---|
| `--g-bg` | `#3a3f46` | Surface |
| `--g-fg` | `#eceef1` | Primary text |
| `--g-muted` | `#b4bac3` | Secondary text |
| `--g-line` | `#4b5159` | Dividers |
| `--g-acc` | `#ffb15c` | Prompt `$`, strings, keywords |
| `--g-ok` | `#7fe0a8` | 200, healthy |
| `--g-info` | `#a9c1ff` | Cold start, functions |

### Tty (hero terminal)

The hero terminal is a near-black screen, identical in both modes; accent, ok and info reuse the graphite values.

| Token | Value | Use |
|---|---|---|
| `--tty-bg` | `#121316` | Screen |
| `--tty-fg` | `#d9dce1` | Primary text |
| `--tty-dim` | `#737a83` | Meta, grey suggestion, unfocused cursor |
| `--tty-sel` | `#2c2f35` | Selected completion, scrollbar |
| `--tty-err` | `#ff9d9d` | Errors, 4xx and 5xx, grep matches |
| `--tty-mag` | `#e2acff` | Numbers in JSON, the PDF in `ls` |
| `--tty-cyan` | `#8adfe6` | `true`, `false`, `null`, git refs |

### Tint chips

Technology and topic chips use the "Tint" recipe from one source color `--c`:

```css
.chip { background: color-mix(in srgb, var(--c) 12%, var(--bg)); color: color-mix(in srgb, var(--c) 75%, var(--fg)); }
```

## Typography

IBM Plex, loaded from Google Fonts with system fallbacks.

| Role | Face | Size / line height |
|---|---|---|
| UI and home body | IBM Plex Sans 400/500/600 | 16px / 1.6 |
| Hero name | IBM Plex Sans 600 | 32px / 1.1, letter-spacing -0.015em |
| Item titles | IBM Plex Sans 600 | 16px / 1.35 |
| Section labels | IBM Plex Mono 600, uppercase, letter-spacing 0.08em | 13px |
| Dates, meta, data, keys | IBM Plex Mono 400/500 | 12 to 12.5px |
| Post body | IBM Plex Serif 400 | 18px / 1.72, measure 68ch |
| Post headings | IBM Plex Sans 600 | 1.4em |
| Code | IBM Plex Mono | 13.5px / 1.65 |

Use `font-variant-numeric: tabular-nums` wherever digits line up.

## Shape and spacing

- Spacing steps: 4, 8, 12, 16, 24, 32, 44 px; sections are separated by 44px.
- Radius: 6px for controls and stamps, 8px for cards, 10 to 12px for panels and popovers, 999px for pills.
- Borders are 1px `--line`; cards get a border, never a shadow, except floating layers (tooltip, palette).
- Page gutter is at least 16px, written with `max(16px, env(safe-area-inset-*))`.
- The hero terminal and the content share one 720px column; the footer spans the 960px page.
- From 1240px the column is centered in the viewport and the side index (180px) sits 60px to its right; between 960px and 1240px the column and the side index share the 960px page; under 960px the column is centered alone.
- Breakpoints: 680px (phone), 960px (rail hides), 1240px (column centers).

## Components

Each row names the chosen variant; the link opens the lab where it was chosen.

### Header

Always visible: the name and a centered "Search or jump to... /" field that opens the palette.
Once a section is in view it adds `/ <current section>` in the section color, and after the hero scrolls away it gains a bottom border.
Labs: [header](https://claude.ai/artifact/LxLYdHMRYY8WJktsCJ4utF) (variants 3 and 4).

### Hero

The hero is one terminal as wide as the content column (440px tall; on phones `min(600px, 85svh)`), with a visually hidden h1 carrying the name.
It opens straight on `juan@ubuntu:~$ neofetch` and its output: a spinning 3D "JA" in ASCII on the left and, on the right, Role, Uptime (years in software engineering, from `careerStart`), Stack, Based (with Buenos Aires local time), Education, Languages, Links (resume, github, linkedin) and Packages (published projects and posts), then the color swatches and "type help to look around".
The server renders the same screen without the clock, so it reads as finished before JS runs.

The prompt is a working bash-like shell over the site content:
- Files: `about.md`, `now.json`, `stack.json`, `resume.pdf`, `access.log`, and `experience/`, `projects/`, `writing/`, `education/` built from the published content.
- Commands: `help` (commands only), `ls`, `cd`, `cat`, `curl` against the real API (`-i` shows the real response headers), `tail -f access.log` following the live feed, `open`, `neofetch`, `git log` (the build this page came from), `history`, `clear`, `exit`, plus `grep`, `jq`, `head`, `wc` and `sort` behind pipes.
- Line editing: block cursor, grey suggestion from history then common commands (accept with → or End, or a tap), Tab completion with a menu that Tab cycles, ↑ ↓ filtered by what was typed, Ctrl+R search, Ctrl+C, Ctrl+L, Ctrl+A, Ctrl+E, Ctrl+U, Ctrl+K; history persists in `localStorage["terminal-history"]`.
- Output stays in scrollback above the prompt; new output follows the bottom only when the reader is already there.
- The JA spins only while on screen and the tab is visible, and holds still under `prefers-reduced-motion`; `tail -f` polls `/api/requests` every 5 s under the same conditions.
- Tab on an empty prompt moves focus on, so the terminal never traps the keyboard.

Lab: [hero terminal](https://claude.ai/artifact/B1tPrXVMcFfDJiZpZk3N3V) (direction C, version 3).

### Side index

"On this page" in its own column right of the content, thin left line, current section in its color.
On the home it starts level with Experience, below the hero, and once scrolled to it sticks 96px from the top.
The current section expands to list its entries (each role, project, post) and the current entry is marked.
Ends with "↑ back to top"; hidden under 960px.
Lab: [side index](https://claude.ai/artifact/GaFz1CxoNBLZpgkr7yVsNH) (variant 8+).

### Experience

One card per role: 44px monogram tile in the section color, role and period on one line, company and place, a 4px tenure bar (6 years = full width, max 220px), summary, Tint chips for stack.
Lab: [experience](https://claude.ai/artifact/XTwDjaAVHrZ14FyLNbVAFw) (variant A, chips Tint).

### Projects

Two groups.
Backend: a horizontal, scroll-snapping strip of media cards (132px thumbnail or architecture diagram on the left, title, year, 3-line summary, chips, link pills) with ← → buttons.
"Earlier engineering work": a compact two-column list with a 44px thumbnail, title, year and tags.
Confidential projects carry a "conf." badge and a diagram instead of screenshots.
Lab: [projects round 2](https://claude.ai/artifact/SDKH9WPFWmJXN54NyEExLW) (variant D).

### Education

A one-column sheet with mono labels on the left.
"Degree": title, school and years, one-line description.
"Certs": certificates inline, separated by middle dots, issuer in mono, optional level badge (EF SET); each opens a preview dialog with "Open original ↗".
Lab: [education round 2](https://claude.ai/artifact/4UnwsSnnQ3zz7KQB3XsJzn) (variant H+).

### About

Left: a stack of polaroid photos; drag the top one away (over 90px) to send it to the back, tap or Enter or arrows also cycle; counter "1 / n".
Right: short bio paragraph.
Below: "Quick questions" as rows, question in mono on the left, answer large with an icon in its color on the right, plus a context line and optional link (Letterboxd).
Lab: [about round 3](https://claude.ai/artifact/QVED8hAiTg1ZtixHnjrpvh) (format A).

### Writing on the home page

A simple list: date and reading time in the writing color, 19px title, one-line summary, no boxes.
Lab: [writing](https://claude.ai/artifact/6Wkh7eCuy4pW9VkdDoG6T1) (variant 1).

### Post page

Plex Serif 18px, 68ch measure, "On this page" index on the right with "n min left", reading progress bar under the header, graphite code blocks with file name and copy button, heading anchors, callouts with a left border in the writing color, footnotes, series navigation at the end.
Lab: [post configurator](https://claude.ai/artifact/7UQFBWdZX6Yww8hNWqBUvw).

### Command palette

Opens with `/` (the hint shown), `⌘K` or `Ctrl+K`, or the header field.
Desktop: centered modal, results grouped by type with a dot in the section color, each result shows its direct shortcut, and a cheat sheet sits at the bottom.
Phone: a bottom sheet with group filter chips and tall rows.
Shortcuts: `g e` experience, `g p` projects, `g d` education, `g w` writing, `g a` about, `j`/`k` next and previous section, `t` theme, `r` resume, `g g` top.
Lab: [palette](https://claude.ai/artifact/WKHskNWpMWx3uQCCWg23U7) (variant 8 desktop, 5 phone).

### Footer

Row 1: "© 2026 Juan Almaraz · GitHub · LinkedIn · RSS" and the build stamp `vX.Y.Z | sha | branch` followed by a status dot.
Row 2: shortcut hints and "↑ back to top".
The dot is green, amber or red; hovering it shows a graphite `$ status` tooltip listing each service, which follows the pointer and disappears 32px from the dot center.
Rows, in order: Website (CloudFront), App (Lambda) with p50 and cold-start ratio, Database (DynamoDB), Media (S3), Public API, Live request log; the footer adds 30 day uptime from the probe.
When `/api/status` is unreachable the tooltip falls back to App (Lambda) and Public API as down.
Keyboard focus and touch show the tooltip anchored above the dot.
Lab: [footer tooltips](https://claude.ai/artifact/1nQk7yTY5htAoVzo3FFmo1) (variant 5).

## Interaction rules

- Every interactive element has a visible focus ring: 2px `--accent`, offset 2px.
- Hover-only behavior always has a keyboard and touch equivalent.
- Live regions update at most every 4 seconds and pause when off screen or the tab is hidden.
- Relative times ("14 s ago") instead of pretending data is instant.
- Copy buttons fall back to "select it" when the clipboard is refused.

## Writing on the site

- Plain, direct English; sentence case for headings and buttons.
- Name things by what visitors recognize ("Resume", not "CV PDF asset").
- No skill bars, no logo walls, no "passionate about" copy.

# Billy Hancock, portfolio

One page, one day in Hamilton. As you scroll, the page moves from dawn over the Waikato river, through the working day at Enform, into a dusk when the office stays lit, and on through the night to the degree, the side projects and the backstory, ending at the next dawn with a way to say hello. The sky behind the page changes with the time the page has reached.

On a first visit, five agents (layout, copy, type, QA and fix) build the top of the page in the dark before sunrise. QA measures the page in your browser and files findings with evidence, fix patches them, QA checks the fixes again, and then the sun comes up. It mirrors the QA and fix agent dashboard I built at Enform.

The finished page is always in the HTML. The build only takes the hero apart and puts it back together, so search engines, screen readers, visitors with scripts off and visitors with reduced motion all get the whole page.

## Run it

Needs Node 22.12 or later.

```bash
npm install
npm run dev
```

Open http://localhost:4321/my-portfolio/. The build plays once per browser. Add `?rebuild` to the address to watch it again, or press **Watch again** in the panel at the top of the page.

```bash
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages through `.github/workflows/deploy.yml`. It's served at https://officialprotondev.github.io/my-portfolio/, so `astro.config.mjs` sets `site` to `https://officialprotondev.github.io` and `base` to `/my-portfolio`.

To move it to a custom domain at the root, add the domain in the repo's Pages settings and build with:

```bash
SITE_URL=https://your-domain.example BASE_PATH=/ npm run build
```

(or change the two defaults in `astro.config.mjs`). The 2023 site this replaced is kept on the `legacy-2023` branch and the `v1-2023` tag.

## Where things are

| What | Where |
| --- | --- |
| The day, as numbers (sky colours, sun, clock) | `src/lib/sky.ts` |
| The live sky, rail and clock | `src/scripts/sky.ts` |
| Hero, river and the agents' panel | `src/components/Hero.astro` |
| Chapter headers | `src/components/Chapter.astro` |
| Case studies | `src/components/cases/*.astro` |
| Engineering detail lists | the `notes` array in each case file |
| Dusk and the skyline | `src/components/Dusk.astro` |
| Also built list | `src/components/More.astro` |
| Backstory timeline | `src/components/Before.astro` |
| Contact and the next dawn | `src/components/Contact.astro` |
| Hills on the horizon | `src/lib/ranges.ts` |
| Colours, type and layout | `src/styles/global.css` |
| Screenshots | `src/assets/shots/` (public pages only) |
| Photos | `src/assets/photos/` (see below) |
| Social preview image | `public/og.png` (1200 × 630) |

### Photos

The EnDrive section has room for two photos of the presentation at the end of the internship. Drop them in `src/assets/photos/` as `stage-wide.jpg` and `stage-close.jpg` (any of jpg, png or webp works). Astro resizes and converts them at build time. Until a file is there, the dev server shows a dashed placeholder and production leaves the slot out.

## How the day works

Every block of the page carries the hours it covers, for example `data-t0="8.5" data-t1="12.75"` on EnDrive. `src/scripts/sky.ts` maps the scroll position onto those hours, and `src/lib/sky.ts` maps the hour onto the sky: stops from 4:30 am to 6 am the next day, blended hour to hour in OKLCH so dusk runs amber, rose, blue rather than through grey. Everything that depends on the light reads from that one number: the sky, the stars, the sun crossing the working day, the sun rising in the hero and again at the end, the office lights at dusk, the clock in the bar and the dot on the rail.

The clock in the bar shows the time printed on the section you're reading. In the two places where the page shows time passing, the dusk and the last dawn (`data-live-clock`), it runs live and so does that section's own time label.

Text set straight on the sky (`data-ink-auto`, in named groups) switches between navy and moonlight a group at a time, choosing whichever keeps its worst-placed line most readable against the sky actually behind it. Without scripts, each block paints its own slice of the day as a static gradient.

## How the build works

`src/scripts/run/` holds the build:

- `run.ts` is the orchestrator. Each agent is an async track. They hand work to each other through promises and channels, so QA starts on a finding while fix is still working on the last one. It holds the clock before dawn while they work and lets it run to sunrise when every check passes.
- `qa.ts` holds the instruments: WCAG contrast from computed colours, leading from computed line height, characters per line from the rendered glyphs, and accessible names for links.
- `overlay.ts` draws the cursors, frames and evidence, anchored to the elements so they follow the page as fixes reflow it.
- `motion.ts` holds abortable timing, so Skip, Escape, scrolling or resizing ends the build cleanly at any point.

The first draft's mistakes are deliberate: the day column too dim against the river, tight leading, and on wide screens type set too small across too long a line. Every number in the log is measured live, though, and QA only files the line-length finding where the line really is too long.

The visitor's answer to the agents' question (short version or engineering detail) is kept in `localStorage` under `bh.detail`, and the last run under `bh.run`. There are no cookies, no analytics and no third-party requests.

## Type

[Newsreader](https://github.com/productiontype/Newsreader) for display, [Instrument Sans](https://github.com/Instrument/instrument-sans) for reading, and IBM Plex Mono only for the agents. All are self-hosted and trimmed by `scripts/subset-fonts.py` to Latin, the weights in use and one optical size per Newsreader style, about 150 KB in all. To regenerate them after changing weights, run `python scripts/subset-fonts.py` (needs Python with fonttools and brotli).

/*
 * The live sky.
 *
 * Every block of the page carries the hours it covers (data-t0, data-t1).
 * Scroll position maps onto those hours, and the hour maps onto the sky in
 * src/lib/sky.ts. Everything that depends on the light reads from here: the
 * sky itself, the stars and moon, the sun rising in the hero, the office
 * lights at dusk, the clock in the bar, the dot on the rail, and the ink for
 * text that sits straight on the sky.
 *
 * The build on a first visit holds the clock before dawn, then lets it run
 * to sunrise.
 */

import { clockText, contrast, rgbToHex, skyAt, skyColorAt, sunAt, type RGB, type Sky } from '../lib/sky';
import { withBase } from '../lib/base';

const INK: RGB = [17, 28, 48];
const INK_2: RGB = [44, 58, 82];
const MOON: RGB = [238, 240, 247];
const MOON_2: RGB = [194, 201, 222];
const SUN_ORB = '#f3a35c';
const MOON_ORB = '#efe7d2';

interface Knot {
  y: number;
  t: number;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smoothstep = (a: number, b: number, v: number) => {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mixRgb = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: RGB) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;

let knots: Knot[] = [];

interface Span {
  el: HTMLElement;
  top: number;
  bottom: number;
  t0: number;
  t1: number;
  live: HTMLElement | null;
}
let spans: Span[] = [];
let held: number | null = null;
let current = 6;
let frame = 0;
let lastClock = '';
// Which ink each group of sky-lit text is on: 1 navy, 0 moonlight. Inks switch
// outright (CSS eases the change) rather than blending through grey, with a
// little hysteresis so they don't flicker at the crossover.
const inkState = new Map<string, number>();
const pick = (key: string, ratio: number) => {
  const prev = inkState.get(key);
  const lr = Math.log(ratio);
  const next = lr > 0.04 ? 1 : lr < -0.04 ? 0 : (prev ?? (lr >= 0 ? 1 : 0));
  inkState.set(key, next);
  return next;
};
let lastTheme = '';
let lastIcon = '';
const listeners = new Set<(sky: Sky) => void>();

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

const els = {
  sky: q('[data-sky]'),
  starfield: q('[data-starfield]'),
  stars: q<HTMLCanvasElement>('[data-stars]'),
  twinkle: q<HTMLCanvasElement>('[data-stars-twinkle]'),
  sun: q('[data-sky-sun]'),
  disc: q('[data-sky-disc]'),
  hero: q('[data-hero]'),
  dusk: q('[data-dusk]'),
  hello: q('[data-hello]'),
  helloRiver: q('[data-hello-river]'),
  bar: q('[data-bar]'),
  now: q('[data-now]'),
  rail: q('[data-rail]'),
  railDot: q('[data-rail-dot]'),
  railChapters: [...document.querySelectorAll<HTMLElement>('.rail-ch')],
  inked: [...document.querySelectorAll<HTMLElement>('[data-ink-auto]')],
  theme: q<HTMLMetaElement>('meta[name="theme-color"]'),
  icon: q<HTMLLinkElement>('link[rel="icon"]'),
};

/* ---------- where each hour sits on the page ---------- */

function measure() {
  const blocks = [...document.querySelectorAll<HTMLElement>('[data-t0]')];
  if (!blocks.length) return;
  const vh = window.innerHeight;
  const ref = vh * 0.45;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  const list: Knot[] = blocks.map((el, i) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    return { y: i === 0 ? 0 : clamp(top - ref, 0, maxScroll), t: parseFloat(el.dataset.t0 ?? '6') };
  });
  list.push({ y: maxScroll, t: parseFloat(blocks[blocks.length - 1].dataset.t1 ?? '30') });
  for (let i = 1; i < list.length; i++) list[i].y = Math.max(list[i].y, list[i - 1].y);
  knots = list;
  spans = blocks.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      el,
      top: r.top + window.scrollY,
      bottom: r.bottom + window.scrollY,
      t0: parseFloat(el.dataset.t0 ?? '6'),
      t1: parseFloat(el.dataset.t1 ?? '30'),
      live: el.hasAttribute('data-live-clock') ? el.querySelector<HTMLElement>('[data-live-time]') : null,
    };
  });
}

/** The block of the page at the reading line. */
function spanAt(y: number): Span | null {
  for (let i = spans.length - 1; i >= 0; i--) if (y >= spans[i].top) return spans[i];
  return spans[0] ?? null;
}

function timeAt(y: number): number {
  if (!knots.length) return 6;
  if (y <= knots[0].y) return knots[0].t;
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1];
    const b = knots[i];
    if (y <= b.y) {
      const span = b.y - a.y;
      return span <= 0 ? b.t : a.t + (b.t - a.t) * ((y - a.y) / span);
    }
  }
  return knots[knots.length - 1].t;
}

/** The scroll position at which the page reaches a given hour. */
export function scrollForTime(t: number): number {
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1];
    const b = knots[i];
    if (t <= b.t) return a.y + (b.y - a.y) * clamp((t - a.t) / (b.t - a.t || 1));
  }
  return knots.length ? knots[knots.length - 1].y : 0;
}

/* ---------- stars ---------- */

function drawStars() {
  const { stars, twinkle } = els;
  if (!stars || !twinkle) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = Math.max(window.innerHeight, els.sky?.clientHeight ?? 0);
  for (const c of [stars, twinkle]) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const a = stars.getContext('2d');
  const b = twinkle.getContext('2d');
  if (!a || !b) return;
  a.setTransform(dpr, 0, 0, dpr, 0, 0);
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  a.clearRect(0, 0, w, h);
  b.clearRect(0, 0, w, h);

  let s = 4021;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;

  // A faint band of the Milky Way, low and diagonal: soft clouds of light
  // and a dusting of tiny stars, never a hard edge.
  const band = (x: number) => h * 0.8 - (x * (h * 0.58)) / w;
  for (let i = 0; i < 14; i++) {
    const x = (i / 13) * w + (r() - 0.5) * w * 0.06;
    const y = band(x) + (r() - 0.5) * h * 0.05;
    const rad = h * (0.12 + r() * 0.1);
    const g = a.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(170,184,236,0.055)');
    g.addColorStop(1, 'rgba(170,184,236,0)');
    a.fillStyle = g;
    a.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const dust = Math.round((w * h) / 2000);
  for (let i = 0; i < dust; i++) {
    const x = r() * w;
    const spread = (r() + r() + r() - 1.5) * h * 0.1;
    a.globalAlpha = 0.1 + r() * 0.32;
    a.fillStyle = '#e2e7ff';
    a.fillRect(x, band(x) + spread, 0.75, 0.75);
  }

  const count = Math.round((w * h) / 3000);
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = Math.pow(r(), 1.15) * h * 0.97;
    const bright = r() < 0.06;
    const warm = r() < 0.16;
    const color = warm ? '255,233,204' : '242,245,255';
    if (bright) {
      // A few brighter stars, crisp, on the layer that twinkles.
      const core = 0.9 + r() * 0.7;
      const g = b.createRadialGradient(x, y, 0, x, y, core * 2.6);
      g.addColorStop(0, `rgba(${color},0.95)`);
      g.addColorStop(0.35, `rgba(${color},0.35)`);
      g.addColorStop(1, `rgba(${color},0)`);
      b.fillStyle = g;
      b.fillRect(x - core * 2.6, y - core * 2.6, core * 5.2, core * 5.2);
    } else {
      a.globalAlpha = 0.28 + r() * 0.62;
      a.fillStyle = `rgb(${color})`;
      const size = 0.5 + r() * 0.8;
      a.fillRect(x, y, size, size);
    }
  }
  a.globalAlpha = 1;
  b.globalAlpha = 1;
}

/* ---------- painting the hour ---------- */

function setSkyVars(el: HTMLElement | null, z: string, m: string, h: string) {
  if (!el) return;
  el.style.setProperty('--sz', z);
  el.style.setProperty('--sm', m);
  el.style.setProperty('--sh', h);
}

function render() {
  frame = 0;
  // Read where the sky-lit text sits before writing anything this frame.
  const vh = window.innerHeight;
  const spots = els.inked.map((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return null;
    // The lightest and darkest sky behind the block, top and bottom.
    return [clamp(r.top / vh), clamp(r.bottom / vh)];
  });
  const t = held ?? timeAt(window.scrollY);
  current = t;
  const sky = skyAt(t);
  const z = rgbToHex(sky.z);
  const m = rgbToHex(sky.m);
  const h = rgbToHex(sky.h);
  setSkyVars(els.sky, z, m, h);
  setSkyVars(els.hero, z, m, h);
  setSkyVars(els.hello, z, m, h);
  setSkyVars(els.helloRiver, z, m, h);

  // Stars come out after dusk; the twinkle layer only runs when they're up.
  if (els.starfield && els.twinkle) {
    els.starfield.style.opacity = sky.stars.toFixed(3);
    els.twinkle.style.animationPlayState = sky.stars > 0.02 ? 'running' : 'paused';
  }

  // The sun crosses the sky through the working day: in from the hero's
  // horizon, high at lunch, down behind the skyline at dusk.
  const sun = sunAt(t);
  if (els.sun && els.disc) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = vw * (0.88 - sun.p * 0.78);
    const y = vh * (0.9 - sun.elevation * 0.76);
    const show = smoothstep(7.05, 7.5, t) * (1 - smoothstep(18.85, 19.25, t));
    const strength = 0.55 + (1 - sun.elevation) * 0.45;
    const at = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    els.sun.style.transform = at;
    els.sun.style.opacity = (show * strength).toFixed(3);
    els.sun.style.setProperty('--warm', (1 - sun.elevation).toFixed(3));
    els.disc.style.transform = at;
    els.disc.style.opacity = (show * (0.62 + (1 - sun.elevation) * 0.25)).toFixed(3);
  }

  // Ink for text that sits straight on the sky: whichever of navy or
  // moonlight reads better, crossfading where they're close.
  const behind = skyColorAt(sky, 0.34);
  const k = smoothstep(-0.08, 0.08, Math.log(contrast(INK, behind) / contrast(MOON, behind)));
  const auto = css(mixRgb(MOON, INK, k));
  const auto2 = css(mixRgb(MOON_2, INK_2, k));
  const top = sky.z;
  const kc = pick('chrome', contrast(INK, top) / contrast(MOON, top));
  const chrome = css(kc ? INK : MOON);
  for (const el of [els.hero, els.dusk]) {
    el?.style.setProperty('--auto-ink', auto);
    el?.style.setProperty('--auto-ink-2', auto2);
  }
  const hour = t % 24;
  const day = hour > 5.75 && hour < 19.1;
  const orb = day ? SUN_ORB : MOON_ORB;
  // Text set straight on the sky picks navy or moonlight a group at a time, so
  // a heading and its paragraph never part ways. The group takes whichever
  // ink keeps its worst-placed line most readable.
  const groups = new Map<string, { els: HTMLElement[]; ink: number; moon: number }>();
  els.inked.forEach((el, i) => {
    const spot = spots[i];
    const name = el.dataset.inkAuto || 'solo';
    const g = groups.get(name) ?? { els: [], ink: Infinity, moon: Infinity };
    g.els.push(el);
    if (spot) {
      for (const f of spot) {
        const bg = skyColorAt(sky, f);
        g.ink = Math.min(g.ink, contrast(INK, bg));
        g.moon = Math.min(g.moon, contrast(MOON, bg));
      }
    }
    groups.set(name, g);
  });
  groups.forEach((g, name) => {
    if (!Number.isFinite(g.ink)) return;
    const ki = pick(name, g.ink / g.moon);
    const ink = css(ki ? INK : MOON);
    const on = css(ki ? MOON : INK);
    g.els.forEach((el) => {
      el.style.setProperty('--auto-ink', ink);
      el.style.setProperty('--auto-on', on);
    });
  });
  for (const el of [els.bar, els.rail]) {
    el?.style.setProperty('--chrome', chrome);
    el?.style.setProperty('--orb', orb);
    el?.classList.toggle('is-moonlit', !day);
  }
  // Phone browsers tint their toolbar with the sky, and the tab icon follows
  // the sun and moon. Both change in quarter-hour steps, not every frame.
  const theme = rgbToHex(skyAt(Math.round(t * 4) / 4).z);
  if (els.theme && theme !== lastTheme) {
    els.theme.content = theme;
    lastTheme = theme;
  }
  const icon = withBase(day ? 'favicon.svg' : 'favicon-night.svg');
  if (els.icon && icon !== lastIcon) {
    els.icon.href = icon;
    lastIcon = icon;
  }

  // The rail waits until the hero's river has scrolled away.
  els.rail?.style.setProperty('--rail-o', smoothstep(6.45, 6.9, t).toFixed(3));
  els.bar?.style.setProperty('--bar-bg', z);

  // The sun in the hero: below the horizon before dawn, rising as you read.
  if (els.hero) {
    const rise = t < 6 ? ((6 - t) / 1.4) * 9 : -clamp((t - 6) / 1.25) * 4.5;
    els.hero.style.setProperty('--sun-rise', `${rise.toFixed(3)}rem`);
    els.hero.style.setProperty('--glint', (0.75 * smoothstep(5.55, 6.05, t)).toFixed(3));
    els.hero.style.setProperty('--mist', (smoothstep(5.1, 5.9, t) * (1 - smoothstep(6.25, 7.1, t))).toFixed(3));
  }

  // The next morning: the sun crests the hills as you reach the bottom.
  if (els.hello) {
    const up = smoothstep(29.5, 30, t);
    els.hello.style.setProperty('--sun-rise', `${((1 - up) * 5 + 0.75).toFixed(3)}rem`);
    els.helloRiver?.style.setProperty('--glint', (0.7 * up).toFixed(3));
  }

  // Office lights come on as the evening goes.
  els.dusk?.style.setProperty('--lit', smoothstep(18.1, 20.3, t).toFixed(3));

  // The clock agrees with the time printed on the section you're reading.
  // Where the page shows time passing (dusk, and the last dawn) it runs live,
  // and so does that section's own time label.
  const reading = held === null ? spanAt(window.scrollY + vh * 0.45) : null;
  const label = !reading || reading.live ? clockText(t) : clockText(reading.t0);
  if (held === null) {
    for (const sp of spans) {
      if (!sp.live) continue;
      const own = clockText(clamp(t, sp.t0, sp.t1));
      if (sp.live.textContent !== own) sp.live.textContent = own;
    }
  }
  if (label !== lastClock && els.now) {
    els.now.textContent = label;
    lastClock = label;
  }
  if (els.railDot) {
    const track = els.railDot.parentElement;
    const H = track?.clientHeight ?? 0;
    const p = clamp((t - 6) / 24);
    els.railDot.style.transform = `translate3d(0, ${(p * H - 5.6).toFixed(1)}px, 0)`;
    let here: HTMLElement | null = null;
    for (const ch of els.railChapters) {
      const at = parseFloat(ch.style.getPropertyValue('--at')) * 24 + 6;
      if (t >= at - 0.05) here = ch;
    }
    els.railChapters.forEach((ch) => ch.classList.toggle('is-here', ch === here));
  }

  listeners.forEach((fn) => fn(sky));
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

/* ---------- control ---------- */

export const sky = {
  /** Stop the clock at an hour, whatever the scroll position. */
  hold(t: number) {
    held = t;
    schedule();
  },
  /** Let scrolling drive the clock again. */
  release() {
    held = null;
    schedule();
  },
  /** The hour the scroll position stands for right now. */
  scrollTime() {
    return timeAt(window.scrollY);
  },
  now() {
    return current;
  },
  current(): Sky {
    return skyAt(current);
  },
  renderNow() {
    if (frame) cancelAnimationFrame(frame);
    render();
  },
  onChange(fn: (s: Sky) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function initSky() {
  if (!els.sky) return;
  measure();
  drawStars();
  render();
  document.documentElement.classList.add('sky-on');

  window.addEventListener('scroll', schedule, { passive: true });

  let resizeTimer = 0;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    measure();
    schedule();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (Math.abs(window.innerWidth - lastW) > 1 || !els.stars?.width) {
        lastW = window.innerWidth;
        drawStars();
      }
    }, 160);
  });

  // Images loading and the detail toggle both move blocks down the page.
  let pending = 0;
  new ResizeObserver(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      measure();
      schedule();
    });
  }).observe(document.body);
}

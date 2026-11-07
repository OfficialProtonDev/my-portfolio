/*
 * One day over Hamilton, as numbers.
 *
 * Narrative time t runs in hours from 4.5 (before dawn, when the agents work)
 * to 30 (6 am the next morning). Each stop is the sky at that hour: zenith,
 * mid sky and horizon. One hour blends into the next in OKLCH, keeping hue and
 * colourfulness so dusk goes from amber through rose to blue instead of
 * through grey. Down the screen, the sky is a gradient mixed in OKLab.
 *
 * Used twice: by Astro at build time for the no-script page backgrounds, and
 * in the browser for the live sky.
 */

export interface SkyStop {
  t: number;
  z: string;
  m: string;
  h: string;
  stars: number;
}

export const STOPS: SkyStop[] = [
  { t: 4.5, z: '#050817', m: '#0a1029', h: '#181e42', stars: 1 },
  { t: 5.4, z: '#101a3d', m: '#26315f', h: '#5a5478', stars: 0.6 },
  // Dawn over the river, where the hero sits.
  { t: 6.0, z: '#6c8db6', m: '#b3bfcf', h: '#f2c6a2', stars: 0 },
  { t: 6.9, z: '#8fb0d2', m: '#d6d6d3', h: '#f7d6ae', stars: 0 },
  // Gold morning, a deep noon blue, then amber as the working day ends.
  { t: 8.2, z: '#9fc2e4', m: '#d3e2ee', h: '#f6ecd9', stars: 0 },
  { t: 12.0, z: '#8fbbe6', m: '#cfe1f1', h: '#f1f5f8', stars: 0 },
  { t: 15.6, z: '#9cbfe0', m: '#d8e1e9', h: '#f6e6cc', stars: 0 },
  { t: 17.3, z: '#a8bbd3', m: '#e7d6c2', h: '#f5c99a', stars: 0 },
  // Sunset, dusk and the blue hour, while the office lights come on.
  { t: 18.4, z: '#6c7aa8', m: '#d0927f', h: '#f39a62', stars: 0 },
  { t: 19.2, z: '#2e3569', m: '#6e4f7e', h: '#cf6f68', stars: 0.12 },
  { t: 20.1, z: '#121a42', m: '#232c5c', h: '#473f70', stars: 0.6 },
  { t: 21.5, z: '#080d26', m: '#0f1636', h: '#1c2350', stars: 1 },
  { t: 25.0, z: '#04071a', m: '#090e29', h: '#13193f', stars: 1 },
  // The small hours lift a little, then first light, then dawn again.
  { t: 27.5, z: '#060a20', m: '#0d1435', h: '#1d2450', stars: 0.95 },
  { t: 29.2, z: '#0e1738', m: '#1f2a55', h: '#4a4a72', stars: 0.6 },
  { t: 29.7, z: '#2c4170', m: '#56658d', h: '#c4917f', stars: 0.15 },
  // A step where the whole sky is mid-light at once, so the text on it can
  // change ink in one go.
  { t: 29.85, z: '#4d6a9c', m: '#7f8fb2', h: '#e3ad92', stars: 0.05 },
  { t: 30.0, z: '#6386b3', m: '#adbacc', h: '#f2c6a2', stars: 0 },
];

export const T_MIN = STOPS[0].t;
export const T_MAX = STOPS[STOPS.length - 1].t;

export type Lab = [number, number, number];
export type RGB = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function rgbToLab([R, G, B]: RGB): Lab {
  const r = toLinear(R / 255);
  const g = toLinear(G / 255);
  const b = toLinear(B / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labToRgb([L, A, Bb]: Lab): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3;
  return [
    255 * toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    255 * toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    255 * toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((v) => Math.max(0, Math.min(255, v))) as RGB;
}

const LABS = STOPS.map((s) => ({
  t: s.t,
  z: rgbToLab(hexToRgb(s.z)),
  m: rgbToLab(hexToRgb(s.m)),
  h: rgbToLab(hexToRgb(s.h)),
  stars: s.stars,
}));

const mixLab = (a: Lab, b: Lab, k: number): Lab => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Mix in OKLCH: lightness and chroma straight, hue the short way round. */
function mixLch(a: Lab, b: Lab, k: number): Lab {
  const c1 = Math.hypot(a[1], a[2]);
  const c2 = Math.hypot(b[1], b[2]);
  let h1 = Math.atan2(a[2], a[1]);
  let h2 = Math.atan2(b[2], b[1]);
  // Near-greys have no reliable hue; borrow the other colour's.
  if (c1 < 0.02) h1 = h2;
  if (c2 < 0.02) h2 = h1;
  let dh = h2 - h1;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  const c = c1 + (c2 - c1) * k;
  const h = h1 + dh * k;
  return [a[0] + (b[0] - a[0]) * k, c * Math.cos(h), c * Math.sin(h)];
}
const smooth = (k: number) => k * k * (3 - 2 * k);

export interface Sky {
  t: number;
  z: RGB;
  m: RGB;
  h: RGB;
  stars: number;
}

export function skyAt(tIn: number): Sky {
  const t = Math.max(T_MIN, Math.min(T_MAX, tIn));
  let i = 0;
  while (i < LABS.length - 2 && t > LABS[i + 1].t) i++;
  const a = LABS[i];
  const b = LABS[i + 1];
  const k = smooth(Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))));
  return {
    t,
    z: labToRgb(mixLch(a.z, b.z, k)),
    m: labToRgb(mixLch(a.m, b.m, k)),
    h: labToRgb(mixLch(a.h, b.h, k)),
    stars: a.stars + (b.stars - a.stars) * k,
  };
}

/** Relative luminance, as WCAG defines it. */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The colour of the sky a given fraction of the way down the viewport. */
export function skyColorAt(sky: Sky, y: number): RGB {
  const zl = rgbToLab(sky.z);
  const ml = rgbToLab(sky.m);
  const hl = rgbToLab(sky.h);
  const SPLIT = 0.58;
  return y < SPLIT ? labToRgb(mixLab(zl, ml, y / SPLIT)) : labToRgb(mixLab(ml, hl, (y - SPLIT) / (1 - SPLIT)));
}

/** The sun's path: up at 6, highest at half past twelve, down by quarter to seven. */
export function sunAt(t: number) {
  const rise = 5.85;
  const set = 18.9;
  const p = (t - rise) / (set - rise);
  const up = p > 0 && p < 1;
  const elevation = up ? Math.sin(p * Math.PI) : 0;
  return { p: Math.max(0, Math.min(1, p)), elevation, up };
}

/** 6 am to 6 am, as text: 21.75 reads "9:45 pm". */
export function clockText(t: number): string {
  const total = Math.round(t * 60);
  const mins = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** The static gradient a section shows when scripts are off. */
export function fallbackBackground(t0: number, t1: number): string {
  const a = rgbToHex(skyAt(t0).m);
  const b = rgbToHex(skyAt(t1).m);
  return `linear-gradient(180deg, ${a}, ${b})`;
}

/** Attributes that place a block of the page in the day: its hours and its no-script background. */
export function hours(t0: number, t1: number) {
  return {
    'data-t0': String(t0),
    'data-t1': String(t1),
    style: `--fallback:${fallbackBackground(t0, t1)}`,
  };
}

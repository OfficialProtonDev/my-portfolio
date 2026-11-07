/*
 * The QA agent's instruments. Everything here measures the live page in the
 * visitor's browser; nothing is precomputed.
 */

export type RGB = [number, number, number];

export function parseColor(value: string): { rgb: RGB; alpha: number } | null {
  const m = value.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
  const [r, g, b] = parts;
  const alpha = parts.length > 3 ? parts[3] : 1;
  return { rgb: [r, g, b], alpha };
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The first opaque background behind an element. A block can declare the
 * colour it paints with a pseudo-element through data-bg, as the river does.
 */
export function backgroundOf(el: Element): RGB {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const declared = (node as HTMLElement).dataset?.bg;
    if (declared && /^#[0-9a-f]{6}$/i.test(declared)) {
      const n = parseInt(declared.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const c = parseColor(getComputedStyle(node).backgroundColor);
    if (c && c.alpha > 0.98) return c.rgb;
  }
  return [30, 28, 25];
}

/** Contrast of an element's text against what's behind it, or a background the caller knows better. */
export function contrastOf(el: Element, behind?: RGB) {
  const bg = behind ?? backgroundOf(el);
  const fg = parseColor(getComputedStyle(el).color) ?? { rgb: [0, 0, 0] as RGB, alpha: 1 };
  const shown = fg.rgb.map((v, i) => v * fg.alpha + bg[i] * (1 - fg.alpha)) as RGB;
  return { ratio: contrastRatio(shown, bg), fg: shown, bg };
}

export function leadingOf(el: Element): number {
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize);
  const lh = cs.lineHeight === 'normal' ? size * 1.2 : parseFloat(cs.lineHeight);
  return lh / size;
}

export interface Line {
  count: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Walks the text a character at a time and groups it into rendered lines. */
export function linesOf(el: Element): Line[] {
  const lines: Line[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let line: Line | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width === 0) continue;
      if (!line || r.top > line.top + r.height * 0.5) {
        if (line) lines.push(line);
        line = { count: 0, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }
      line.count++;
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.bottom = Math.max(line.bottom, r.bottom);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Average characters per full line: the typographer's measure. */
export function measureOf(el: Element): number {
  const lines = linesOf(el);
  const full = lines.length > 1 ? lines.slice(0, -1) : lines;
  if (!full.length) return 0;
  return Math.round(full.reduce((s, l) => s + l.count, 0) / full.length);
}

/** A pragmatic accessible-name calculation for links and buttons. */
export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label?.trim()) return label.trim();
  let text = '';
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
    else if (n instanceof Element && n.getAttribute('aria-hidden') !== 'true') n.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  if (text.trim()) return text.trim().replace(/\s+/g, ' ');
  return el.getAttribute('title')?.trim() ?? '';
}

export const hex = (rgb: RGB) =>
  '#' +
  rgb
    .map((v) =>
      Math.round(v)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();

export const fixed1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

import { ease, tween } from './motion';

const NS = 'http://www.w3.org/2000/svg';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** An agent's pointer, with its name beside it. */
export class Cursor {
  el: HTMLDivElement;
  x = 0;
  y = 0;

  constructor(parent: HTMLElement, name: string) {
    this.el = document.createElement('div');
    this.el.className = 'bl-cursor';
    this.el.innerHTML =
      '<svg viewBox="0 0 15 21" aria-hidden="true"><path class="arrow" d="M1 1v16.4l4.1-3.9 2.9 6.6 2.8-1.2-2.8-6.4h5.8z"/></svg><span class="who"></span>';
    this.el.querySelector('.who')!.textContent = name;
    this.el.style.opacity = '0';
    parent.append(this.el);
  }

  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.el.style.transform = `translate3d(${(x - 1).toFixed(1)}px, ${(y - 1).toFixed(1)}px, 0)`;
  }

  show() {
    this.el.style.opacity = '1';
    this.el.animate([{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1' }], {
      duration: 260,
      easing: 'cubic-bezier(.16,1,.3,1)',
    });
  }

  hide() {
    this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
  }

  tap() {
    this.el.animate([{ scale: '1' }, { scale: '0.84' }, { scale: '1' }], { duration: 240, easing: 'ease-out' });
  }

  /** Glides along a gentle curve, the way a hand moves a mouse. */
  to(x: number, y: number, signal: AbortSignal, ms?: number) {
    const x0 = this.x;
    const y0 = this.y;
    const dx = x - x0;
    const dy = y - y0;
    const dist = Math.hypot(dx, dy);
    const dur = ms ?? Math.min(420, 140 + dist * 0.28);
    const bend = dist > 40 ? 0.16 : 0;
    const cx = x0 + dx * 0.5 - dy * bend;
    const cy = y0 + dy * 0.5 + dx * bend;
    return tween(
      dur,
      (t) => {
        const u = 1 - t;
        this.set(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      },
      signal,
      ease.inOut,
    );
  }
}

type Updater = () => void;

/** Everything the agents draw, kept in step with the page underneath. */
export class Overlay {
  root: HTMLDivElement;
  svg: SVGSVGElement;
  private updaters = new Set<Updater>();

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'bl';
    this.root.setAttribute('aria-hidden', 'true');
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'bl-svg');
    this.root.append(this.svg);
    document.body.append(this.root);
  }

  cursor(name: string) {
    return new Cursor(this.root, name);
  }

  /** Re-runs every anchored item; called each frame while the page reflows. */
  refresh() {
    this.updaters.forEach((u) => u());
  }

  track(update: Updater) {
    this.updaters.add(update);
    update();
    return () => this.updaters.delete(update);
  }

  /** A rectangle that draws itself on, then stays as a dashed guide. */
  frame(target: Element | (() => Box), { dur = 420, guide = true } = {}) {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('class', 'bl-frame');
    this.svg.append(rect);
    const get = typeof target === 'function' ? target : () => boxOf(target);
    let drawn = false;
    const place = () => {
      const b = get();
      rect.setAttribute('x', String(Math.round(b.x) + 0.5));
      rect.setAttribute('y', String(Math.round(b.y) + 0.5));
      rect.setAttribute('width', String(Math.max(0, Math.round(b.w) - 1)));
      rect.setAttribute('height', String(Math.max(0, Math.round(b.h) - 1)));
      return b;
    };
    const b = place();
    const per = 2 * (b.w + b.h);
    rect.style.strokeDasharray = `${per}`;
    rect.style.strokeDashoffset = `${per}`;
    const anim = rect.animate([{ strokeDashoffset: per }, { strokeDashoffset: 0 }], {
      duration: dur,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards',
    });
    anim.finished
      .then(() => {
        drawn = true;
        anim.cancel();
        rect.style.strokeDasharray = '';
        rect.style.strokeDashoffset = '';
        if (guide) rect.classList.add('is-guide');
      })
      .catch(() => {});
    this.track(() => {
      if (drawn) place();
    });
    return rect;
  }

  /** A small label pinned to a point the caller computes. */
  tag(content: string | Node[], at: () => { x: number; y: number }, { outline = false, align = 'left' } = {}) {
    const el = document.createElement('div');
    el.className = 'bl-tag' + (outline ? ' is-outline' : '');
    if (typeof content === 'string') el.textContent = content;
    else el.append(...content);
    this.root.append(el);
    const stop = this.track(() => {
      const p = at();
      const x = align === 'right' ? p.x - el.offsetWidth : p.x;
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(p.y)}px, 0)`;
    });
    el.animate([{ opacity: 0, translate: '0 3px' }, { opacity: 1, translate: '0 0' }], {
      duration: 240,
      easing: 'cubic-bezier(.16,1,.3,1)',
    });
    return {
      el,
      set(next: string | Node[], asOutline = outline) {
        el.className = 'bl-tag' + (asOutline ? ' is-outline' : '');
        if (typeof next === 'string') el.textContent = next;
        else el.replaceChildren(...next);
      },
      remove: (fade = true) => {
        stop();
        if (!fade) return el.remove();
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(
          () => el.remove(),
          () => el.remove(),
        );
      },
    };
  }

  /** A hairline between two points the caller computes. */
  line(at: () => { x1: number; y1: number; x2: number; y2: number }) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('class', 'bl-line');
    this.svg.append(l);
    const stop = this.track(() => {
      const p = at();
      l.setAttribute('x1', String(Math.round(p.x1) + 0.5));
      l.setAttribute('y1', String(Math.round(p.y1) + 0.5));
      l.setAttribute('x2', String(Math.round(p.x2) + 0.5));
      l.setAttribute('y2', String(Math.round(p.y2) + 0.5));
    });
    l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    return {
      remove: () => {
        stop();
        l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(
          () => l.remove(),
          () => l.remove(),
        );
      },
    };
  }

  /** The page's twelve columns, flashed on briefly. */
  columns(area: Box, count: number, gap: number) {
    const w = (area.w - gap * (count - 1)) / count;
    const rects: SVGRectElement[] = [];
    for (let i = 0; i < count; i++) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', 'bl-col');
      r.setAttribute('x', String(area.x + i * (w + gap)));
      r.setAttribute('y', String(area.y));
      r.setAttribute('width', String(w));
      r.setAttribute('height', String(area.h));
      r.style.opacity = '0';
      this.svg.prepend(r);
      rects.push(r);
      r.animate([{ opacity: 0 }, { opacity: 0.045 }, { opacity: 0.045 }, { opacity: 0 }], {
        duration: 1100,
        delay: i * 28,
        easing: 'ease-in-out',
        fill: 'forwards',
      }).finished.then(
        () => r.remove(),
        () => r.remove(),
      );
    }
    return rects;
  }

  async leave(fast = false) {
    if (fast) {
      this.root.remove();
      return;
    }
    this.root.classList.add('is-leaving');
    await new Promise((r) => window.setTimeout(r, 480));
    this.root.remove();
  }
}

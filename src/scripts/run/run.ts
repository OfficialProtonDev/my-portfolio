/*
 * The night shift.
 *
 * The finished page is always in the HTML. On a first visit this script takes
 * the top of it apart before dawn, and five agents put it back together in
 * the dark. They work in parallel and hand work to each other through
 * channels. The QA agent's numbers are measured live in the visitor's
 * browser, and the fix agent's changes are real style changes that QA
 * re-measures. When every check passes, the sun comes up.
 */

import { getDetail, hasAnswered } from '../detail';
import { sky } from '../sky';
import { skyColorAt } from '../../lib/sky';
import { mark, RunLog } from './log';
import { Aborted, Channel, deferred, ease, lerp, sleep, tween, until } from './motion';
import { boxOf, Overlay, type Box, type Cursor } from './overlay';
import { accessibleName, contrastOf, fixed1, hex, leadingOf, measureOf, parseColor, type RGB } from './qa';

const STORE = 'bh.run';
const DIM = '#5d6a80';
const AGENTS = ['layout', 'copy', 'type', 'qa', 'fix'] as const;
type AgentName = (typeof AGENTS)[number] | 'orchestrator';

/** Narrative hours: the agents start at quarter to five and the sun is up at six. */
const NIGHT = 4.75;
const FIRST_LIGHT = 5.3;
const DAWN = 6;

interface Saved {
  n: number;
  ms: number;
  found: number;
  fixed: number;
  skipped: boolean;
  at: number;
}

function loadSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return v && typeof v.n === 'number' ? v : null;
  } catch {
    return null;
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* no storage: every visit is a first visit */
  }
}

/** The page's clock as a log stamp: 4:52 am reads "04:52". */
function stamp(t = sky.now()) {
  const mins = Math.round(t * 60) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

interface Els {
  html: HTMLElement;
  hero: HTMLElement;
  river: HTMLElement;
  mark: HTMLElement;
  links: HTMLElement;
  clock: HTMLElement;
  name: HTMLElement;
  lines: HTMLElement[];
  tag: HTMLElement;
  dayTitle: HTMLElement;
  day: HTMLElement;
  nightTitle: HTMLElement;
  night: HTMLElement;
  cue: HTMLAnchorElement;
  run: HTMLElement;
  title: HTMLElement;
  state: HTMLElement;
  btn: HTMLButtonElement;
  logBtn: HTMLButtonElement;
  agents: Map<string, HTMLElement>;
  log: HTMLOListElement;
  qcard: HTMLElement;
  live: HTMLElement;
}

function collect(): Els | null {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const run = document.querySelector<HTMLElement>('[data-run]');
  if (!hero || !run) return null;
  const one = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  const name = one(hero, '[data-b="name"]');
  return {
    html: document.documentElement,
    hero,
    river: one(hero, '.hero-river'),
    mark: one(document, '[data-b="mark"]'),
    links: one(document, '[data-b="links"]'),
    clock: one(document, '[data-b="clock"]'),
    name,
    lines: [...name.querySelectorAll<HTMLElement>('.ln')],
    tag: one(hero, '[data-b="tag"]'),
    dayTitle: one(hero, '[data-b="day-title"]'),
    day: one(hero, '[data-b="day"]'),
    nightTitle: one(hero, '[data-b="night-title"]'),
    night: one(hero, '[data-b="night"]'),
    cue: one<HTMLAnchorElement>(hero, '[data-b="cue"]'),
    run,
    title: one(run, '[data-run-title]'),
    state: one(run, '[data-run-state]'),
    btn: one<HTMLButtonElement>(run, '[data-run-btn]'),
    logBtn: one<HTMLButtonElement>(run, '[data-run-logbtn]'),
    agents: new Map([...run.querySelectorAll<HTMLElement>('[data-agent]')].map((el) => [el.dataset.agent ?? '', el])),
    log: one<HTMLOListElement>(run, '[data-run-log]'),
    qcard: one(run, '[data-run-q]'),
    live: one(run, '[data-run-live]'),
  };
}

/* ---------- text the copy agent streams in ---------- */

interface Part {
  done: Text;
  pend: Text;
  full: string;
}

/** Keeps the full text laid out (so nothing reflows) but invisible until revealed. */
function splitPending(el: HTMLElement): Part[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes.map((node, i) => {
    let full = node.data.replace(/\s+/g, ' ');
    if (i === 0) full = full.trimStart();
    if (i === nodes.length - 1) full = full.trimEnd();
    const doneSpan = document.createElement('span');
    const pendSpan = document.createElement('span');
    pendSpan.className = 'tk-pend';
    const done = document.createTextNode('');
    const pend = document.createTextNode(full);
    doneSpan.append(done);
    pendSpan.append(pend);
    node.replaceWith(doneSpan, pendSpan);
    return { done, pend, full };
  });
}

function reveal(parts: Part[], count: number) {
  let left = count;
  for (const p of parts) {
    const n = Math.max(0, Math.min(p.full.length, left));
    p.done.data = p.full.slice(0, n);
    p.pend.data = p.full.slice(n);
    left -= p.full.length;
  }
}

/** Token-ish boundaries: words, with long words broken every few letters. */
function tokenStops(text: string): number[] {
  const stops = [0];
  const re = /\s*\S{1,4}/g;
  for (let m = re.exec(text); m; m = re.exec(text)) stops.push(m.index + m[0].length);
  if (stops[stops.length - 1] !== text.length) stops.push(text.length);
  return stops;
}

function endOfText(parts: Part[]): { x: number; y: number } | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const d = parts[i].done;
    if (!d.data.length) continue;
    const r = document.createRange();
    r.setStart(d, d.data.length - 1);
    r.setEnd(d, d.data.length);
    const b = r.getBoundingClientRect();
    return { x: b.right, y: b.bottom };
  }
  return null;
}

/** The bounding box of an element's text rather than its block. */
function textBox(el: Element): Box {
  const r = document.createRange();
  r.selectNodeContents(el);
  const b = r.getBoundingClientRect();
  return b.width > 2 ? { x: b.left, y: b.top, w: b.width, h: b.height } : boxOf(el);
}

const dims = (el: Element) => {
  const b = el.getBoundingClientRect();
  return `${Math.round(b.width)} × ${Math.round(b.height)}`;
};

function swatch(rgb: RGB) {
  const s = document.createElement('span');
  s.className = 'sw';
  s.style.background = `rgb(${rgb.map(Math.round).join(' ')})`;
  return s;
}

/** What's behind text that sits straight on the sky: the sky itself, at that height. */
function skyBehind(el: Element): RGB {
  const b = el.getBoundingClientRect();
  const y = Math.max(0, Math.min(1, (b.top + b.height / 2) / window.innerHeight));
  return skyColorAt(sky.current(), y) as RGB;
}

/* ---------- the stage: the hero taken apart, and how to put it back ---------- */

interface Stage {
  n: number;
  name: string[];
  html: Map<HTMLElement, string>;
  cueLabel: string;
  tagParts: Part[];
  dayTitleParts: Part[];
  dayParts: Part[];
  nightTitleParts: Part[];
  nightParts: Part[];
  final: { color: RGB; lh: number; size: number; maxWidthPx: number; maxWidthEm: string };
  measureDefect: boolean;
  caret: HTMLSpanElement;
  cursors: Partial<Record<AgentName, Cursor>>;
  found: number;
  fixed: number;
}

const WAIT = (els: Els) => [els.mark, els.links, els.clock, els.cue];

function prepare(els: Els, n: number): Stage {
  const cs = getComputedStyle(els.day);
  const size = parseFloat(cs.fontSize);
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');

  const html = new Map<HTMLElement, string>();
  for (const el of [els.tag, els.dayTitle, els.day, els.nightTitle, els.night]) html.set(el, el.innerHTML);

  const stage: Stage = {
    n,
    name: els.lines.map((l) => l.textContent ?? ''),
    html,
    cueLabel: els.cue.getAttribute('aria-label') ?? 'Start the day',
    tagParts: [],
    dayTitleParts: [],
    dayParts: [],
    nightTitleParts: [],
    nightParts: [],
    final: {
      color: parseColor(cs.color)?.rgb ?? [211, 217, 232],
      lh: parseFloat(cs.lineHeight) / size,
      size,
      maxWidthPx: parseFloat(cs.maxWidth) || els.day.getBoundingClientRect().width,
      maxWidthEm: `${Math.round((parseFloat(cs.maxWidth) || els.day.getBoundingClientRect().width) / size)}em`,
    },
    measureDefect: false,
    caret,
    cursors: {},
    found: 0,
    fixed: 0,
  };

  // The copy agent types the name in its own voice; the type agent sets it.
  els.lines.forEach((l) => (l.textContent = ''));
  els.name.classList.add('is-agent-voice');

  stage.tagParts = splitPending(els.tag);
  stage.dayTitleParts = splitPending(els.dayTitle.querySelector('a') ?? els.dayTitle);
  stage.dayParts = splitPending(els.day);
  stage.nightTitleParts = splitPending(els.nightTitle.querySelector('a') ?? els.nightTitle);
  stage.nightParts = splitPending(els.night);

  // The first draft's mistakes, for QA to find: the day column dim against
  // the river and its lines packed tight, and where the screen is wide, set
  // so small that the lines run long.
  els.day.style.color = DIM;
  els.day.style.lineHeight = '1.1';
  if (window.innerWidth > 900) {
    els.day.style.fontSize = `${(size * 0.78).toFixed(2)}px`;
    els.day.style.letterSpacing = '-0.01em';
    els.day.style.maxWidth = 'none';
    stage.measureDefect = measureOf(els.day) > 75;
    if (!stage.measureDefect) {
      els.day.style.fontSize = '';
      els.day.style.letterSpacing = '';
      els.day.style.maxWidth = '';
    }
  }

  els.cue.removeAttribute('aria-label');
  WAIT(els).forEach((e) => {
    e.setAttribute('data-b-wait', '');
    e.classList.remove('is-placed');
  });
  return stage;
}

function finalize(els: Els, stage: Stage) {
  els.lines.forEach((l, i) => (l.textContent = stage.name[i]));
  els.name.classList.remove('is-agent-voice');
  stage.html.forEach((value, el) => {
    el.innerHTML = value;
  });
  els.day.removeAttribute('style');
  els.cue.setAttribute('aria-label', stage.cueLabel);
  stage.caret.remove();
  WAIT(els).forEach((e) => {
    e.removeAttribute('data-b-wait');
    e.classList.remove('is-placed');
  });
  els.html.classList.remove('build-running', 'build-pending');
}

/* ---------- the sequence ---------- */

interface Finding {
  id: string;
  point: () => { x: number; y: number };
  fix: () => Promise<void>;
  recheck: () => void;
}

interface Ctx {
  els: Els;
  log: RunLog;
  ov: Overlay;
  signal: AbortSignal;
  stage: Stage;
}

async function sequence({ els, log, ov, signal, stage }: Ctx) {
  const say = (agent: AgentName | 'you', msg: string | (string | Node)[]) => log.line(agent, msg);
  const setAgent = (name: AgentName, state: 'idle' | 'busy' | 'done') =>
    els.agents.get(name)?.setAttribute('data-state', state);
  const wait = (ms: number) => sleep(ms, signal);

  setAgent('orchestrator', 'busy');
  say('orchestrator', 'The page has to be up before sunrise. Splitting it four ways.');
  await wait(140);

  const cur = {} as Record<(typeof AGENTS)[number], Cursor>;
  for (const name of AGENTS) {
    const c = ov.cursor(name);
    const chip = els.agents.get(name)!.getBoundingClientRect();
    c.set(chip.left + 3, chip.top + chip.height / 2);
    cur[name] = c;
    stage.cursors[name] = c;
  }
  say('orchestrator', 'Dispatched layout, copy, type, qa and fix.');
  for (const name of AGENTS) {
    cur[name].show();
    await wait(18);
  }

  const nameFramed = deferred();
  const tagFramed = deferred();
  const colsFramed = deferred();
  const nameTyped = deferred();
  const nameSet = deferred();
  const dayDone = deferred();
  const daySet = deferred();
  const cuePlaced = deferred();
  const findings = new Channel<Finding>();
  const fixed = new Channel<Finding>();

  const stream = async (parts: Part[], ms: number, c: Cursor) => {
    const text = parts.map((p) => p.full).join('');
    const stops = tokenStops(text);
    let last = -1;
    await tween(
      ms,
      (t) => {
        const k = stops[Math.round(t * (stops.length - 1))];
        if (k === last) return;
        last = k;
        reveal(parts, k);
        const p = endOfText(parts);
        if (p) c.set(p.x + 3, p.y - 3);
      },
      signal,
      ease.linear,
    );
    reveal(parts, text.length);
  };

  const place = (el: HTMLElement) => el.classList.add('is-placed');

  /* layout: a frame for everything the others fill, then the horizon and the bar */
  const layout = async () => {
    const c = cur.layout;
    setAgent('layout', 'busy');
    const nb = boxOf(els.name);
    await c.to(nb.x + 10, nb.y + 10, signal);
    c.tap();
    ov.frame(els.name);
    // The tag reads the frame's real size as the name fills it.
    let shown = `h1 ${dims(els.name)}`;
    let label: { set: (next: string) => void } | null = null;
    const t1 = ov.tag(shown, () => {
      const b = boxOf(els.name);
      const now = `h1 ${dims(els.name)}`;
      if (now !== shown && label) {
        shown = now;
        label.set(now);
      }
      return { x: b.x, y: b.y - 24 };
    });
    label = t1;
    say('layout', `Framed the name at ${dims(els.name)}.`);
    nameFramed.resolve();
    await wait(40);

    const tb = boxOf(els.tag);
    await c.to(tb.x + 10, tb.y + 6, signal);
    ov.frame(els.tag);
    tagFramed.resolve();

    const cols = [els.day.parentElement!, els.night.parentElement!];
    for (const col of cols) {
      const b = boxOf(col);
      await c.to(b.x + 10, b.y + 8, signal);
      c.tap();
      ov.frame(col);
    }
    say('layout', 'Framed two columns on the water: by day, by night.');
    colsFramed.resolve();
    await wait(40);

    const horizonY = () => boxOf(els.river).y;
    await c.to(window.innerWidth * 0.18, horizonY(), signal);
    c.tap();
    ov.line(() => ({ x1: 0, y1: horizonY(), x2: window.innerWidth, y2: horizonY() }));
    const pct = Math.round(((boxOf(els.river).y - boxOf(els.hero).y) / boxOf(els.hero).h) * 100);
    const ht = ov.tag(`horizon ${pct}%`, () => ({ x: window.innerWidth * 0.18 + 10, y: horizonY() - 26 }));
    say('layout', `Set the horizon ${pct}% of the way down, over the river.`);
    await wait(40);

    const mb = boxOf(els.mark);
    await c.to(mb.x + 6, mb.y + mb.h / 2, signal);
    c.tap();
    ov.frame(els.mark, { dur: 280, guide: false });
    place(els.mark);
    const lb = boxOf(els.links);
    await c.to(lb.x + lb.w * 0.4, lb.y + lb.h / 2, signal, 300);
    ov.frame(els.links, { dur: 280, guide: false });
    place(els.links);
    place(els.clock);
    say('layout', 'Placed the bar: a name, four chapters and a clock.');

    const cb = boxOf(els.cue);
    await c.to(cb.x + cb.w / 2, cb.y + cb.h / 2, signal);
    c.tap();
    place(els.cue);
    cuePlaced.resolve();
    await wait(200);
    ht.remove();
    t1.remove();
    await c.to(window.innerWidth * 0.5, horizonY() - 40, signal);
    setAgent('layout', 'done');
  };

  /* copy: types the name, streams the words */
  const copy = async () => {
    const c = cur.copy;
    const l0 = boxOf(els.name);
    await c.to(l0.x + 8, l0.y + l0.h * 0.35, signal);
    await until(nameFramed.promise, signal);
    setAgent('copy', 'busy');
    say('copy', `Writing the name: “${stage.name.join(' ')}”.`);
    for (let i = 0; i < els.lines.length; i++) {
      const text = stage.name[i];
      for (let k = 1; k <= text.length; k++) {
        els.lines[i].textContent = text.slice(0, k);
        els.lines[i].append(stage.caret);
        const cb = stage.caret.getBoundingClientRect();
        c.set(cb.right + 4, cb.bottom - cb.height * 0.15);
        ov.refresh();
        await wait(24 + Math.random() * 24);
      }
    }
    stage.caret.remove();
    nameTyped.resolve();

    await until(tagFramed.promise, signal);
    const tb = boxOf(els.tag);
    await c.to(tb.x + 6, tb.y + 12, signal);
    await stream(stage.tagParts, 280, c);

    await until(colsFramed.promise, signal);
    const db = boxOf(els.day.parentElement!);
    await c.to(db.x + 6, db.y + 14, signal);
    const chars = stage.dayParts.reduce((s, p) => s + p.full.length, 0);
    say('copy', `Streaming the day column, ${chars} characters.`);
    await stream(stage.dayTitleParts, 90, c);
    await stream(stage.dayParts, 540, c);
    dayDone.resolve();
    const nb = boxOf(els.night.parentElement!);
    await c.to(nb.x + 6, nb.y + 14, signal);
    say('copy', 'Streaming the night column.');
    await stream(stage.nightTitleParts, 90, c);
    await stream(stage.nightParts, 500, c);
    setAgent('copy', 'done');
    await c.to(nb.x + nb.w * 0.6, nb.y + nb.h + 30, signal);
  };

  /* type: sets the name glyph by glyph, and sets the day column (badly) */
  const type = async () => {
    const c = cur.type;
    const plan = boxOf(els.name);
    await c.to(plan.x + plan.w * 0.55, plan.y + plan.h * 0.6, signal);
    await until(nameTyped.promise, signal);
    setAgent('type', 'busy');
    say('type', 'Setting the name in Newsreader Light, the surname in italic.');
    const glyphs: HTMLSpanElement[] = [];
    els.lines.forEach((line) => {
      const text = line.textContent ?? '';
      line.textContent = '';
      for (const ch of text) {
        const s = document.createElement('span');
        s.className = 'is-agent-voice';
        s.textContent = ch;
        line.append(s);
        glyphs.push(s);
      }
    });
    els.name.classList.remove('is-agent-voice');
    for (const g of glyphs) {
      g.classList.remove('is-agent-voice');
      g.classList.add('glyph-set');
      const b = g.getBoundingClientRect();
      c.set(b.left + b.width * 0.6, b.top + b.height * 0.62);
      ov.refresh();
      await wait(34);
    }
    await wait(80);
    els.lines.forEach((l, i) => (l.textContent = stage.name[i]));
    ov.refresh();
    nameSet.resolve();

    await until(dayDone.promise, signal);
    const db = boxOf(els.day);
    await c.to(db.x + db.w * 0.3, db.y + db.h * 0.5, signal);
    const size = Math.round(parseFloat(getComputedStyle(els.day).fontSize));
    say('type', `Set the day column at ${size}px, leading ${leadingOf(els.day).toFixed(2)}, in ${DIM.toUpperCase()}.`);
    daySet.resolve();
    setAgent('type', 'done');
    await wait(60);
    await c.to(db.x + db.w * 0.75, db.y - 30, signal);
  };

  /* qa: measures, files findings, re-checks fixes */
  const qa = async () => {
    const c = cur.qa;
    const plan = boxOf(els.name);
    await c.to(plan.x + 40, plan.y - 8, signal);
    await until(nameSet.promise, signal);
    setAgent('qa', 'busy');

    const tb = textBox(els.name);
    await c.to(tb.x + 28, tb.y + 20, signal, 240);
    const h1c = contrastOf(els.name, skyBehind(els.name));
    const passTag = ov.tag(`contrast ${fixed1(h1c.ratio)}:1 pass`, () => {
      const b = textBox(els.name);
      return { x: b.x + 2, y: b.y - 24 };
    });
    say('qa', ['Checked the name against the night sky: ', mark(true, `${fixed1(h1c.ratio)}:1`), '. Pass.']);
    await wait(90);

    await until(dayDone.promise, signal);
    const row: HTMLElement[] = [];
    const chipAt = (me: () => HTMLElement | undefined) => () => {
      const b = boxOf(els.day.parentElement!);
      let x = b.x;
      const el = me();
      for (const e of row) {
        if (e === el) break;
        x += e.offsetWidth + 6;
      }
      return { x, y: b.y - 27 };
    };
    const chip = (content: string | Node[]) => {
      let el: HTMLElement | undefined;
      const t = ov.tag(content, chipAt(() => el), { outline: true });
      el = t.el;
      row.push(el);
      ov.refresh();
      return t;
    };
    const day = () => boxOf(els.day);
    const file = (f: Finding) => {
      stage.found++;
      findings.push(f);
    };

    // F1: contrast against the river
    await c.to(day().x + 34, day().y + 12, signal);
    const c1 = contrastOf(els.day);
    const f1 = chip([swatch(c1.fg), swatch(c1.bg), `F1 ${fixed1(c1.ratio)}:1`]);
    say('qa', ['F1: the day column is ', mark(false, `${fixed1(c1.ratio)}:1`), ' against the river. Body text needs 4.5:1.']);
    file({
      id: 'F1',
      point: () => ({ x: day().x + 60, y: day().y + 16 }),
      fix: async () => {
        const from = c1.fg;
        const to = stage.final.color;
        say('fix', `F1: colour ${hex(from)} to ${hex(to)}.`);
        await tween(
          260,
          (t) => {
            els.day.style.color = `rgb(${from.map((v, i) => Math.round(lerp(v, to[i], t))).join(' ')})`;
          },
          signal,
          ease.out,
        );
      },
      recheck: () => {
        const r = contrastOf(els.day);
        f1.set([swatch(r.fg), swatch(r.bg), `F1 ${fixed1(c1.ratio)} → ${fixed1(r.ratio)}:1 pass`], false);
        say('qa', ['F1 re-checked: ', mark(true, `${fixed1(r.ratio)}:1`), '. Pass.']);
      },
    });
    await wait(70);

    // F2: leading, shown as the line pitch
    await c.to(day().x + day().w * 0.25, day().y + 30, signal);
    const lead = leadingOf(els.day);
    const pitch = (i: number) => () => {
      const b = day();
      const lh = parseFloat(getComputedStyle(els.day).lineHeight);
      const y = b.y + lh * i;
      return { x1: b.x - 10, y1: y, x2: b.x + Math.min(b.w, 240), y2: y };
    };
    const g1 = ov.line(pitch(1));
    const g2 = ov.line(pitch(2));
    const f2 = chip(`F2 leading ${lead.toFixed(2)}`);
    say('qa', ['F2: leading on the day column is ', mark(false, lead.toFixed(2)), '. Body copy reads best at 1.4 to 1.6.']);
    file({
      id: 'F2',
      point: () => ({ x: day().x + 120, y: day().y + 36 }),
      fix: async () => {
        const to = stage.final.lh;
        say('fix', `F2: line-height ${lead.toFixed(2)} to ${to.toFixed(2)}.`);
        await tween(
          320,
          (t) => {
            els.day.style.lineHeight = lerp(lead, to, t).toFixed(3);
            ov.refresh();
          },
          signal,
          ease.inOut,
        );
      },
      recheck: () => {
        const v = leadingOf(els.day);
        f2.set(`F2 leading ${lead.toFixed(2)} → ${v.toFixed(2)} pass`, false);
        g1.remove();
        g2.remove();
        say('qa', ['F2 re-checked: leading ', mark(true, v.toFixed(2)), '. Pass.']);
      },
    });
    await wait(70);

    // F3: measure, only where the screen is wide enough for it to be wrong
    if (stage.measureDefect) {
      await c.to(day().x + day().w - 40, day().y + 12, signal);
      const m = measureOf(els.day);
      const ruler = ov.line(() => {
        const b = textBox(els.day);
        return { x1: b.x, y1: b.y - 4, x2: b.x + b.w, y2: b.y - 4 };
      });
      const f3 = chip(`F3 ${m} chars a line`);
      say('qa', ['F3: the day column runs ', mark(false, `${m} characters`), ' a line. Aim for 45 to 75.']);
      file({
        id: 'F3',
        point: () => ({ x: day().x + day().w - 30, y: day().y + 14 }),
        fix: async () => {
          const fromS = parseFloat(getComputedStyle(els.day).fontSize);
          const toS = stage.final.size;
          const fromW = els.day.getBoundingClientRect().width;
          const toW = stage.final.maxWidthPx;
          say('fix', `F3: type ${Math.round(fromS)}px to ${Math.round(toS)}px, and max-width none to ${stage.final.maxWidthEm}.`);
          await tween(
            440,
            (t) => {
              els.day.style.fontSize = `${lerp(fromS, toS, t).toFixed(2)}px`;
              els.day.style.letterSpacing = `${lerp(-0.01, 0, t).toFixed(4)}em`;
              els.day.style.maxWidth = `${lerp(fromW, toW, t).toFixed(1)}px`;
              ov.refresh();
            },
            signal,
            ease.inOut,
          );
        },
        recheck: () => {
          const v = measureOf(els.day);
          f3.set(`F3 ${m} → ${v} chars pass`, false);
          ruler.remove();
          say('qa', ['F3 re-checked: ', mark(true, `${v} characters`), ' a line. Pass.']);
        },
      });
      await wait(70);
    }

    // F4: the arrow to the rest of the page has no accessible name
    await until(cuePlaced.promise, signal);
    const cueBox = () => boxOf(els.cue);
    await c.to(cueBox().x + 16, cueBox().y + 18, signal);
    if (!accessibleName(els.cue)) {
      ov.frame(els.cue, { dur: 300, guide: false });
      const f4 = ov.tag(
        'F4 no accessible name',
        () => {
          const b = cueBox();
          return { x: b.x + b.w + 8, y: b.y + b.h / 2 - 10 };
        },
        { outline: true },
      );
      say('qa', ['F4: the arrow to the rest of the page has ', mark(false, 'no accessible name'), ', so a screen reader would only say “link”.']);
      file({
        id: 'F4',
        point: () => ({ x: cueBox().x + 12, y: cueBox().y + 14 }),
        fix: async () => {
          els.cue.setAttribute('aria-label', stage.cueLabel);
          say('fix', `F4: added aria-label “${stage.cueLabel}”.`);
          await wait(150);
        },
        recheck: () => {
          const v = accessibleName(els.cue);
          f4.set('F4 named “Start the day” pass', false);
          say('qa', ['F4 re-checked: the arrow is called ', mark(true, `“${v}”`), '. Pass.']);
        },
      });
    }
    findings.close();

    for (;;) {
      const next = await fixed.next(signal);
      if (next.done) break;
      const f = next.value;
      const p = f.point();
      await c.to(p.x + 18, p.y + 14, signal);
      f.recheck();
      stage.fixed++;
      ov.refresh();
      await wait(170);
    }
    passTag.remove();
    setAgent('qa', 'done');
  };

  /* fix: works through QA's findings as they arrive */
  const fix = async () => {
    const c = cur.fix;
    const plan = boxOf(els.day.parentElement!);
    await c.to(plan.x + plan.w * 0.6, plan.y + plan.h + 30, signal);
    for (;;) {
      const next = await findings.next(signal);
      if (next.done) break;
      setAgent('fix', 'busy');
      const f = next.value;
      const p = f.point();
      await c.to(p.x, p.y, signal);
      c.tap();
      await f.fix();
      ov.refresh();
      fixed.push(f);
      await wait(30);
    }
    fixed.close();
    setAgent('fix', 'done');
  };

  await Promise.all([layout(), copy(), type(), qa(), fix()]);
}

/* ---------- controller ---------- */

export function initRun() {
  let els: Els | null;
  try {
    els = collect();
  } catch {
    els = null;
  }
  if (!els) {
    document.documentElement.classList.remove('build-pending');
    sky.release();
    return;
  }
  const E = els;
  const log = new RunLog(E.log, () => stamp());
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = false;
  let controller: AbortController | null = null;

  // A first visit starts in the dark, before the agents have even arrived.
  if (E.html.classList.contains('build-pending')) {
    sky.hold(NIGHT);
    sky.renderNow();
  }

  const describe = () => (getDetail() === 'deep' ? 'engineering detail' : 'the short version');

  // The agents ask their one question right after they finish, once. After
  // that, the Detail switches in each chapter do the same job.
  document.addEventListener('detailchange', (event) => {
    const { source } = (event as CustomEvent<{ source: string }>).detail;
    if (source === 'init') return;
    log.line('you', describe(), { kind: 'human' });
    log.line(
      'orchestrator',
      getDetail() === 'deep' ? 'Noted. The projects now show engineering detail.' : 'Noted. The projects stay short.',
    );
    E.qcard.hidden = true;
  });

  E.logBtn.addEventListener('click', () => {
    const open = !E.run.classList.contains('is-open');
    E.run.classList.toggle('is-open', open);
    E.logBtn.setAttribute('aria-expanded', String(open));
    E.logBtn.textContent = open ? 'Hide the log' : 'Show the log';
    // Lines added while the log was folded away didn't scroll it; start at the latest.
    if (open) E.log.scrollTop = E.log.scrollHeight;
  });

  const showIdle = () => E.agents.forEach((el) => el.setAttribute('data-state', 'idle'));

  const settle = () => {
    E.btn.textContent = 'Watch again';
    E.btn.hidden = reduce.matches;
    E.logBtn.hidden = false;
    E.run.classList.remove('is-open');
    E.logBtn.setAttribute('aria-expanded', 'false');
    E.logBtn.textContent = 'Show the log';
  };

  const restore = (why: 'cache' | 'reduced' | 'partway') => {
    E.html.classList.remove('build-pending', 'build-running');
    sky.release();
    const saved = loadSaved();
    log.clear();
    if (why === 'reduced') {
      E.title.textContent = 'Served at dawn';
      E.state.textContent = 'without the build';
      log.line('orchestrator', 'Reduced motion is on, so the agents skipped the show and served the finished page.', { stamp: '06:00', quiet: true });
    } else if (why === 'cache' && saved) {
      E.title.textContent = 'Built before sunrise';
      E.state.textContent = 'by five agents';
      log.line('orchestrator', `Restored the night shift from your last visit (run ${saved.n}).`, { stamp: '06:00', quiet: true });
      if (!saved.skipped) log.line('qa', `Last time: ${saved.found} found, ${saved.fixed} fixed, 0 open.`, { stamp: '06:00', quiet: true });
      log.line('orchestrator', 'Press Watch again to see the agents build it.', { stamp: '06:00', quiet: true });
    } else {
      const partway = Boolean(location.hash) || window.scrollY > 40;
      E.title.textContent = 'Built before sunrise';
      E.state.textContent = 'by five agents';
      log.line(
        'orchestrator',
        partway ? 'You arrived partway down the page, so it was served finished.' : 'Served the finished page.',
        { stamp: '06:00', quiet: true },
      );
      log.line('orchestrator', 'Press Watch again to see five agents put the top of it together before dawn.', { stamp: '06:00', quiet: true });
    }
    E.qcard.hidden = true;
    showIdle();
    settle();
  };

  const skip = () => controller?.abort();

  const start = async () => {
    if (running) return;
    running = true;
    sky.hold(NIGHT);
    if (document.visibilityState !== 'visible') {
      await new Promise<void>((r) =>
        document.addEventListener('visibilitychange', function onVis() {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', onVis);
            r();
          }
        }),
      );
    }
    await Promise.race([document.fonts?.ready, new Promise((r) => window.setTimeout(r, 1200))]);
    if (window.scrollY > 40) {
      running = false;
      return restore('partway');
    }

    controller = new AbortController();
    const signal = controller.signal;
    const saved = loadSaved();
    const stage = prepare(E, (saved?.n ?? 0) + 1);
    E.html.classList.add('build-running');
    E.html.classList.remove('build-pending');

    const ov = new Overlay();
    const t0 = performance.now();
    log.clear();
    E.title.textContent = 'Night shift';
    E.state.textContent = 'building the page';
    E.btn.textContent = 'Skip';
    E.btn.hidden = false;
    E.logBtn.hidden = true;
    E.qcard.hidden = true;
    showIdle();

    // The night wears on while they work.
    let night = 0;
    const tick = () => {
      if (!running || signal.aborted) return;
      sky.hold(Math.min(FIRST_LIGHT, NIGHT + ((performance.now() - t0) / 1000) * 0.095));
      night = requestAnimationFrame(tick);
    };
    night = requestAnimationFrame(tick);

    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 24) skip();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    // Only a real change of layout ends the build; scrollbars and mobile
    // toolbars nudge the viewport without moving anything that matters.
    const startW = window.innerWidth;
    const onResize = () => {
      if (Math.abs(window.innerWidth - startW) > 48) skip();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    let skipped = false;
    try {
      await sequence({ els: E, log, ov, signal, stage });
      cancelAnimationFrame(night);
      log.line('orchestrator', 'Every check passes. Bringing the sun up.');
      E.state.textContent = 'sunrise';
      const dock = AGENTS.map((name) => {
        const c = stage.cursors[name];
        const chip = E.agents.get(name)?.getBoundingClientRect();
        if (!c || !chip) return Promise.resolve();
        return c.to(chip.left + 3, chip.top + chip.height / 2, signal, 420).then(() => c.hide());
      });
      const leaving = ov.leave();
      const from = sky.now();
      E.html.classList.add('build-sunrise');
      await Promise.all([
        ...dock,
        leaving,
        tween(1900, (k) => sky.hold(lerp(from, DAWN, k)), signal, ease.inOut),
      ]);
    } catch (err) {
      if (!(err instanceof Aborted)) console.error(err);
      skipped = true;
      await ov.leave(true);
    }
    cancelAnimationFrame(night);

    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);

    const secs = (performance.now() - t0) / 1000;
    finalize(E, stage);
    E.html.classList.remove('build-sunrise');
    sky.release();
    running = false;
    controller = null;

    E.title.textContent = 'Built before sunrise';
    if (skipped) {
      log.line('orchestrator', `Skipped to sunrise at ${secs.toFixed(1)}s and served the finished page.`, { stamp: '06:00' });
      E.state.textContent = 'skipped to the end';
    } else {
      log.line('orchestrator', `Up at dawn. ${stage.found} found, ${stage.fixed} fixed, 0 open, in ${secs.toFixed(1)}s.`, { stamp: '06:00' });
      E.state.textContent = `in ${secs.toFixed(1)}s`;
    }
    E.agents.forEach((el) => el.setAttribute('data-state', 'done'));
    E.live.textContent = 'The page has finished building.';
    settle();
    if (!hasAnswered()) {
      log.line('orchestrator', 'One question for you.', { stamp: '06:00' });
      E.qcard.hidden = false;
      E.qcard.classList.add('is-new');
    }

    save({ n: stage.n, ms: Math.round(secs * 1000), found: stage.found, fixed: stage.fixed, skipped, at: Date.now() });
  };

  const rebuild = async () => {
    if (running || reduce.matches) return;
    if (window.scrollY > 2) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const t = performance.now();
      while (window.scrollY > 2 && performance.now() - t < 1600) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      window.scrollTo({ top: 0 });
    }
    // Wind the clock back to before dawn.
    const from = sky.now();
    E.qcard.hidden = true;
    E.html.classList.add('build-pending');
    await tween(700, (k) => sky.hold(lerp(from, NIGHT, k)), new AbortController().signal, ease.inOut);
    await start();
  };

  E.btn.addEventListener('click', () => (running ? skip() : void rebuild()));
  document.querySelector('[data-rebuild]')?.addEventListener('click', () => void rebuild());

  if (E.html.classList.contains('build-pending') && !reduce.matches) {
    void start();
  } else {
    restore(reduce.matches ? 'reduced' : loadSaved() ? 'cache' : 'partway');
  }
}

export type LineKind = 'human' | 'plain';

/** The orchestrator's log: what each agent did, stamped with the page's clock. */
export class RunLog {
  constructor(
    private list: HTMLOListElement,
    private clock: () => string,
  ) {}

  clear() {
    this.list.replaceChildren();
  }

  line(agent: string, msg: string | (string | Node)[], opts: { kind?: LineKind; stamp?: string; quiet?: boolean } = {}) {
    const li = document.createElement('li');
    li.className = 'run-line';
    if (opts.kind === 'human') li.classList.add('is-human');
    if (!opts.quiet) li.classList.add('is-new');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = opts.stamp ?? this.clock();
    const a = document.createElement('span');
    a.className = 'a';
    a.textContent = agent;
    const m = document.createElement('span');
    m.className = 'm';
    if (Array.isArray(msg)) m.append(...msg);
    else m.textContent = msg;
    li.append(t, a, m);
    this.list.append(li);
    this.list.scrollTop = this.list.scrollHeight;
    return li;
  }
}

export function mark(ok: boolean, text: string) {
  const s = document.createElement('span');
  s.className = ok ? 'ok' : 'no';
  s.textContent = text;
  return s;
}

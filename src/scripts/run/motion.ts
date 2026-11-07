/** Thrown into every pending step when the build is skipped. */
export class Aborted extends Error {
  constructor() {
    super('build aborted');
  }
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new Aborted());
    };
    const id = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  settle: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -9 * t)),
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Runs `update` every frame for `ms`, with eased progress from 0 to 1. */
export function tween(
  ms: number,
  update: (p: number) => void,
  signal: AbortSignal,
  easing: Ease = ease.inOut,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const start = performance.now();
    let raf = 0;
    const onAbort = () => {
      cancelAnimationFrame(raf);
      reject(new Aborted());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const frame = (now: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
      update(easing(t));
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }
    };
    raf = requestAnimationFrame(frame);
  });
}

export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  done: boolean;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const d = { done: false } as Deferred<T>;
  d.promise = new Promise<T>((r) => (resolve = r));
  d.resolve = (value: T) => {
    d.done = true;
    resolve(value);
  };
  return d;
}

/** Waits for a promise, but gives up the moment the build is skipped. */
export function until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const onAbort = () => reject(new Aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** A small queue one agent can hand work to another through. */
export class Channel<T> {
  private items: T[] = [];
  private waiting: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(item: T) {
    const next = this.waiting.shift();
    if (next) next({ value: item, done: false });
    else this.items.push(item);
  }

  close() {
    this.closed = true;
    for (const next of this.waiting.splice(0)) next({ value: undefined, done: true });
  }

  async next(signal: AbortSignal): Promise<IteratorResult<T>> {
    if (this.items.length) return { value: this.items.shift()!, done: false };
    if (this.closed) return { value: undefined, done: true };
    return until(new Promise<IteratorResult<T>>((r) => this.waiting.push(r)), signal);
  }
}

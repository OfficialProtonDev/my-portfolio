export type Detail = 'short' | 'deep';
export type DetailSource = 'init' | 'question' | 'toggle';

const KEY = 'bh.detail';

export function getDetail(): Detail {
  return document.documentElement.getAttribute('data-detail') === 'deep' ? 'deep' : 'short';
}

export function hasAnswered(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function setDetail(mode: Detail, source: DetailSource) {
  document.documentElement.setAttribute('data-detail', mode);
  if (source !== 'init') {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* private mode: the choice just won't persist */
    }
  }
  document.querySelectorAll<HTMLElement>('[data-deep]').forEach((el) => {
    el.inert = mode !== 'deep';
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-detail-toggle] [data-detail-set]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.detailSet === mode)));
  document.dispatchEvent(new CustomEvent('detailchange', { detail: { mode, source } }));
}

export function initDetail() {
  document.querySelectorAll<HTMLElement>('[data-detail-toggle]').forEach((toggle) => (toggle.hidden = false));
  setDetail(getDetail(), 'init');

  document.addEventListener('click', (event) => {
    const btn = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-detail-set]');
    if (!btn) return;
    const mode = btn.dataset.detailSet === 'deep' ? 'deep' : 'short';
    setDetail(mode, btn.closest('[data-run-q]') ? 'question' : 'toggle');
  });
}

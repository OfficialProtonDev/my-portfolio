/** Local time in Hamilton, kept current. */
export function initClock() {
  const els = document.querySelectorAll<HTMLTimeElement>('[data-clock]');
  if (!els.length) return;
  const time = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const day = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long' });
  const tick = () => {
    const now = new Date();
    const label = `${time.format(now).replace(/\s/g, ' ')} on ${day.format(now)}`;
    els.forEach((el) => {
      el.textContent = label;
      el.dateTime = now.toISOString();
    });
  };
  tick();
  window.setInterval(tick, 30_000);
}

/** Copy-to-clipboard buttons, with a selection fallback. */
export function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    const status = btn.parentElement?.querySelector<HTMLElement>('[data-copy-status]');
    const idle = btn.textContent ?? 'Copy';
    let timer = 0;
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copy ?? '';
      let message = 'Copied';
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const link = btn.parentElement?.querySelector('a');
        if (link) {
          const range = document.createRange();
          range.selectNodeContents(link);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        message = 'Selected, press Ctrl+C';
      }
      btn.textContent = message;
      if (status) status.textContent = message === 'Copied' ? 'Email address copied' : message;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        btn.textContent = idle;
        if (status) status.textContent = '';
      }, 2200);
    });
  });
}

/** A hairline under the nav once the page has scrolled. */
export function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return;
  const update = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

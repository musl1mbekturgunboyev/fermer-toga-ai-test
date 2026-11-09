/* Mobile navigation only. Section links retain the existing application routes. */
(() => {
  const root = document.getElementById('root');
  const mobile = matchMedia('(max-width: 800px)');
  let returnFocus = null;

  function setMenu(open, restoreFocus = true) {
    const side = root.querySelector('#app-navigation');
    if (!side) return;
    const isOpen = mobile.matches && open;
    if (isOpen) returnFocus = document.activeElement;
    document.body.classList.toggle('nav-open', isOpen);
    const main = root.querySelector('.main');
    const bottomNav = root.querySelector('.bn');
    if (main) main.inert = isOpen;
    if (bottomNav) bottomNav.inert = isOpen;
    side.inert = mobile.matches && !isOpen;
    side.setAttribute('aria-hidden', String(mobile.matches && !isOpen));
    const backdrop = root.querySelector('.nav-scrim');
    if (backdrop) backdrop.hidden = !isOpen;
    const trigger = root.querySelector('[data-menu-open]');
    trigger?.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      side.querySelector('[data-menu-close]')?.focus();
    } else if (restoreFocus && returnFocus?.isConnected) {
      returnFocus.focus();
      returnFocus = null;
    }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-menu-open]')) setMenu(true);
    if (event.target.closest('[data-menu-close]')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('nav-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); return; }
    if (event.key !== 'Tab') return;
    const links = [...root.querySelectorAll('#app-navigation a, #app-navigation button')].filter(element => element.getClientRects().length);
    const first = links[0], last = links.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobile.addEventListener('change', () => setMenu(false));
  new MutationObserver(() => setMenu(false, false)).observe(root, { childList: true });
  setMenu(false, false);
})();

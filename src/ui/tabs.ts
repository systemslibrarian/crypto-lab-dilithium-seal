export type TabRenderer = (container: HTMLElement) => void;

export interface Tab {
  id: string;
  label: string;
  /**
   * Fetch this panel's renderer.
   *
   * A thunk rather than a renderer so panels that are not the landing tab can
   * be split into their own chunks: four of the five are code no first-time
   * visitor executes, and making them wait for a click is the difference
   * between a 145 KB initial bundle and a 65 KB one.
   *
   * The landing tab resolves immediately from a static import, so first paint
   * never waits on a second round trip.
   */
  load: () => Promise<TabRenderer>;
}

export function initTabs(tabs: Tab[]): void {
  const nav = document.getElementById('tabs')!;
  const content = document.getElementById('tab-content')!;

  tabs.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'tab-content');
    btn.id = `tab-btn-${tab.id}`;
    if (i !== 0) btn.setAttribute('tabindex', '-1');
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => activate(tab.id));
    nav.appendChild(btn);
  });

  // Arrow key navigation between tabs (WCAG tab pattern)
  nav.addEventListener('keydown', (e: KeyboardEvent) => {
    const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const current = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    let next = -1;
    if (e.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    if (next >= 0) {
      e.preventDefault();
      buttons[next].focus();
      activate(tabs[next].id);
    }
  });

  /**
   * The panel whose content `#tab-content` currently belongs to.
   *
   * Loads are asynchronous, so two quick clicks can have two chunks in flight
   * and the slower one can land last. Without this guard the reader ends up on
   * a panel they already navigated away from.
   */
  let pending: string | null = null;

  function activate(id: string): void {
    nav.querySelectorAll('button').forEach((b) => {
      const isActive = b.dataset.tab === id;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    content.innerHTML = '';
    content.setAttribute('aria-labelledby', `tab-btn-${id}`);

    pending = id;
    const tab = tabs.find((t) => t.id === id)!;
    void tab
      .load()
      .then((render) => {
        if (pending !== id) return; // a later click won
        render(content);
      })
      .catch((err: unknown) => {
        if (pending !== id) return;
        // A chunk that fails to load must say so. Silence here looks exactly
        // like a tab with nothing in it.
        content.innerHTML =
          '<div class="card"><h2>This section could not be loaded</h2>' +
          '<p class="text-sm text-muted">Check your connection and try again. ' +
          'The rest of the demo, including signing and verification, is unaffected.</p></div>';
        console.error(`tab "${id}" failed to load`, err);
      });
  }

  if (tabs.length > 0) activate(tabs[0].id);
}

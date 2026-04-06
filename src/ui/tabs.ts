export interface Tab {
  id: string;
  label: string;
  render: (container: HTMLElement) => void;
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

  function activate(id: string) {
    nav.querySelectorAll('button').forEach((b) => {
      const isActive = b.dataset.tab === id;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    content.innerHTML = '';
    content.setAttribute('aria-labelledby', `tab-btn-${id}`);
    const tab = tabs.find((t) => t.id === id)!;
    tab.render(content);
  }

  if (tabs.length > 0) activate(tabs[0].id);
}

/**
 * dilithium-seal — ML-DSA browser demo
 *
 * ML-DSA is the NIST FIPS 204 standard; CRYSTALS-Dilithium is the competition
 * submission it was standardized from. They are related, not interchangeable —
 * see src/data/sources.ts and the standards-status panel on the About tab.
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import './style.css';
import { initTabs, type Tab } from './ui/tabs';
// Static: this is the landing tab, so first paint must not wait on a second
// round trip. The other four are dynamic — see their `load` thunks below.
import { renderSignVerify } from './ui/tab1-sign-verify';
import { renderStandardsStrip } from './ui/provenance';

/**
 * Four of these five panels are code no first-time visitor executes: the
 * comparison charts, the walkthrough with its two visualizations and its
 * timing measurement, the standards trio, and the About tab with the parameter
 * table, provenance panel and implementation identity. Loading them eagerly
 * made every visitor download and parse all of it before seeing anything.
 *
 * The landing tab stays static so first paint never waits on a second request.
 */
const tabs: Tab[] = [
  { id: 'sign-verify', label: 'Sign & Verify', load: async () => renderSignVerify },
  { id: 'compare', label: 'Compare', load: () => import('./ui/tab2-compare').then((m) => m.renderCompare) },
  {
    id: 'how-it-works',
    label: 'How It Works',
    load: () => import('./ui/tab3-how-it-works').then((m) => m.renderHowItWorks),
  },
  { id: 'pqc-trio', label: 'PQC Trio', load: () => import('./ui/tab4-pqc-trio').then((m) => m.renderPQCTrio) },
  { id: 'about', label: 'About', load: () => import('./ui/tab5-about').then((m) => m.renderAbout) },
];

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const toggle = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  if (!toggle) return;

  const isDark = theme === 'dark';
  toggle.textContent = isDark ? '🌙' : '☀️';
  toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

function initThemeToggle(): void {
  const toggle = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  if (!toggle) return;

  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current);

  toggle.addEventListener('click', () => {
    const active = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(active === 'dark' ? 'light' : 'dark');
  });
}

const strip = document.getElementById('standards-strip');
if (strip) renderStandardsStrip(strip);

initTabs(tabs);
initThemeToggle();

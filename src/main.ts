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
import { renderSignVerify } from './ui/tab1-sign-verify';
import { renderCompare } from './ui/tab2-compare';
import { renderHowItWorks } from './ui/tab3-how-it-works';
import { renderPQCTrio } from './ui/tab4-pqc-trio';
import { renderAbout } from './ui/tab5-about';
import { renderStandardsStrip } from './ui/provenance';

const tabs: Tab[] = [
  { id: 'sign-verify', label: 'Sign & Verify', render: renderSignVerify },
  { id: 'compare', label: 'Compare', render: renderCompare },
  { id: 'how-it-works', label: 'How It Works', render: renderHowItWorks },
  { id: 'pqc-trio', label: 'PQC Trio', render: renderPQCTrio },
  { id: 'about', label: 'About', render: renderAbout },
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

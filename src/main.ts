/**
 * dilithium-seal — ML-DSA (CRYSTALS-Dilithium) browser demo
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import './style.css';
import { initTabs, type Tab } from './ui/tabs';
import { renderSignVerify } from './ui/tab1-sign-verify';
import { renderCompare } from './ui/tab2-compare';
import { renderHowItWorks } from './ui/tab3-how-it-works';
import { renderPQCTrio } from './ui/tab4-pqc-trio';
import { renderAbout } from './ui/tab5-about';

const tabs: Tab[] = [
  { id: 'sign-verify', label: 'Sign & Verify', render: renderSignVerify },
  { id: 'compare', label: 'Compare', render: renderCompare },
  { id: 'how-it-works', label: 'How It Works', render: renderHowItWorks },
  { id: 'pqc-trio', label: 'PQC Trio', render: renderPQCTrio },
  { id: 'about', label: 'About', render: renderAbout },
];

initTabs(tabs);

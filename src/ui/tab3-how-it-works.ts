/**
 * Tab 3 — How ML-DSA Works (Interactive Stepper)
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

interface StepInfo {
  title: string;
  body: string;
}

const STEPS: StepInfo[] = [
  {
    title: 'The Two Hard Problems',
    body: `
      <p>ML-DSA rests on two lattice problems simultaneously:</p>
      <div class="math-block">
        <div class="label-tag">Module-LWE (Learning With Errors)</div>
        Given random matrix <strong>A</strong> and vector <strong>t = As + e</strong>, recover <strong>s</strong>.
        The "error" e makes this hard — even for quantum computers.
      </div>
      <div class="math-block">
        <div class="label-tag">Module-SIS (Short Integer Solution)</div>
        Given random matrix <strong>A</strong>, find a short vector <strong>x</strong> such that <strong>Ax = 0 (mod q)</strong>.
        "Short" means small coefficients — finding one is computationally intractable.
      </div>
      <p class="mt-1">No known quantum algorithm solves either efficiently. Shor's algorithm, which breaks RSA and ECDSA, does not apply to lattice problems. This is what makes ML-DSA post-quantum secure.</p>
    `,
  },
  {
    title: 'Key Generation',
    body: `
      <p>KeyGen produces a public key for verification and a secret key for signing.</p>
      <div class="math-block">
        <div class="label-tag">Secret vectors</div>
        Sample <strong>s₁</strong> and <strong>s₂</strong> with small coefficients
        (from a centered binomial distribution, bounded by η)
      </div>
      <div class="math-block">
        <div class="label-tag">Public key computation</div>
        <strong>t = As₁ + s₂ (mod q)</strong><br>
        where <strong>A</strong> is a public random matrix derived from a seed ρ
      </div>
      <div class="math-block">
        <div class="label-tag">Keys</div>
        Public key: <strong>(ρ, t₁)</strong> — where t₁ is the high-order bits of t<br>
        Secret key: <strong>(ρ, K, tr, s₁, s₂, t₀)</strong> — includes low-order bits t₀
      </div>
      <p class="mt-1">Recovering s₁ from (A, t) requires solving the Module-LWE problem — believed hard for both classical and quantum computers.</p>
    `,
  },
  {
    title: 'Signing (Fiat-Shamir with Aborts)',
    body: `
      <p>ML-DSA uses the "Fiat-Shamir with aborts" paradigm. The abort mechanism is critical — it prevents signatures from leaking the private key.</p>
      <div class="math-block">
        <div class="label-tag">1. Mask</div>
        Sample a random masking vector <strong>y</strong> with coefficients bounded by γ₁
      </div>
      <div class="math-block">
        <div class="label-tag">2. Commit</div>
        Compute commitment <strong>w = Ay (mod q)</strong>
      </div>
      <div class="math-block">
        <div class="label-tag">3. Challenge</div>
        Hash the message and commitment: <strong>c̃ = H(μ ∥ w₁)</strong><br>
        Derive challenge polynomial <strong>c</strong> from c̃
      </div>
      <div class="math-block">
        <div class="label-tag">4. Respond (with possible abort)</div>
        Compute <strong>z = y + cs₁</strong><br>
        If ‖z‖∞ ≥ γ₁ − β → <strong>ABORT and retry</strong> (z too large, would leak s₁)<br>
        Check hint conditions → if they fail → <strong>ABORT and retry</strong>
      </div>
      <div class="math-block">
        <div class="label-tag">5. Output</div>
        Signature: <strong>(c̃, z, h)</strong> where h is a hint vector
      </div>
      <p class="mt-1">The abort–retry loop runs 4–7 times on average. Without aborts, statistical analysis of many signatures could recover s₁.</p>
    `,
  },
  {
    title: 'Verification',
    body: `
      <p>Verification checks that the signature was created by someone who knows s₁, without revealing s₁.</p>
      <div class="math-block">
        <div class="label-tag">1. Recompute commitment</div>
        Compute <strong>w'₁ = UseHint(h, Az − ct₁·2^d, 2γ₂)</strong><br>
        This recovers the high-order bits of the original commitment
      </div>
      <div class="math-block">
        <div class="label-tag">2. Recompute challenge</div>
        Compute <strong>c̃' = H(μ ∥ w'₁)</strong>
      </div>
      <div class="math-block">
        <div class="label-tag">3. Check</div>
        Verify <strong>c̃' = c̃</strong> (challenge matches)<br>
        Verify <strong>‖z‖∞ &lt; γ₁ − β</strong> (response is short enough)<br>
        Verify hint <strong>h</strong> has at most ω non-zero entries
      </div>
      <p class="mt-1">If all checks pass, the signature is valid. The verifier is convinced the signer knew s₁ because only someone with s₁ could produce a short z that satisfies the challenge equation.</p>
    `,
  },
  {
    title: 'Why Quantum Computers Fail',
    body: `
      <p>Shor's algorithm breaks RSA and ECDSA because their security relies on <strong>factoring</strong> and <strong>discrete logarithm</strong> — problems with efficient quantum algorithms. ML-DSA is fundamentally different.</p>
      <div class="math-block">
        <div class="label-tag">Classical schemes (broken by quantum)</div>
        RSA: security ← factoring N = p·q → Shor's solves in O((log N)³)<br>
        ECDSA: security ← discrete log on elliptic curves → Shor's solves in O((log p)³)
      </div>
      <div class="math-block">
        <div class="label-tag">ML-DSA (quantum resistant)</div>
        Module-LWE: no known quantum algorithm faster than classical<br>
        Module-SIS: no known quantum algorithm faster than classical<br>
        Best known quantum speedup: Grover's → quadratic reduction only
      </div>
      <p class="mt-1"><strong>ML-DSA-65</strong> targets NIST Security Category 3 — providing approximately <strong>165-bit post-quantum security</strong>. Even a large-scale quantum computer would need an infeasible number of operations to forge a signature.</p>
      <p class="mt-1">The lattice problems underlying ML-DSA have been studied for over 25 years with no quantum breakthrough. This is why NIST selected them as the foundation for post-quantum cryptography.</p>
    `,
  },
];

export function renderHowItWorks(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card">
      <h2>How ML-DSA Works</h2>
      <p class="text-sm text-muted mb-1">A five-step walkthrough of the Module-LWE + Module-SIS mathematical foundation. Click or press Enter on each step to expand.</p>
      <div class="stepper" id="stepper"></div>
    </div>

    <div class="card">
      <h2>Attribution</h2>
      <p class="text-sm text-muted">CRYSTALS-Dilithium was designed by Léo Ducas, Eike Kiltz, Tancrède Lepoint, Vadim Lyubashevsky, Peter Schwabe, Gregor Seiler, and Damien Stehlé.</p>
      <p class="text-sm text-muted mt-1">Submitted to the NIST Post-Quantum Cryptography competition in 2017. Selected as a finalist in 2022. Standardized as <strong>ML-DSA (FIPS 204)</strong> in August 2024.</p>
      <p class="text-sm text-muted mt-1"><strong>Connection to ML-KEM:</strong> Both ML-DSA and ML-KEM (FIPS 203, demonstrated in <a href="https://github.com/systemslibrarian/crypto-compare" target="_blank" rel="noopener">kyber-vault</a>) use the Module-LWE problem — the same mathematical foundation applied to different cryptographic goals (signatures vs key encapsulation).</p>
    </div>
  `;

  const stepper = document.getElementById('stepper')!;
  STEPS.forEach((step, i) => {
    const div = document.createElement('div');
    div.className = `step${i === 0 ? ' active' : ''}`;
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'button');
    div.setAttribute('aria-expanded', i === 0 ? 'true' : 'false');
    div.setAttribute('aria-label', `Step ${i + 1}: ${step.title}`);
    div.innerHTML = `
      <div class="step-title">${step.title}</div>
      <div class="step-body" id="step-body-${i}">${step.body}</div>
    `;
    const toggleStep = () => {
      stepper.querySelectorAll('.step').forEach((s) => {
        s.classList.remove('active');
        s.setAttribute('aria-expanded', 'false');
      });
      div.classList.add('active');
      div.setAttribute('aria-expanded', 'true');
    };
    div.addEventListener('click', toggleStep);
    div.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleStep();
      }
    });
    stepper.appendChild(div);
  });
}

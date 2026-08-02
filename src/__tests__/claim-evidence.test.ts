import { describe, expect, it } from 'vitest';
import { signRunSummary } from '../ui/viz-render';

describe('claim evidence', () => {
  it('does not claim acceptance when the illustrative signer hits its safety cap', () => {
    const summary = signRunSummary({
      attempts: Array.from({ length: 40 }, () => ({ accepted: false })),
    });
    expect(summary).toContain('40');
    expect(summary).toContain('did not produce an accepted response');
    expect(summary).not.toContain('then accepted');
  });

  it('reports an observed acceptance only when the final attempt accepted', () => {
    const summary = signRunSummary({
      attempts: [{ accepted: false }, { accepted: true }],
    });
    expect(summary).toContain('then accepted attempt 2');
  });
});

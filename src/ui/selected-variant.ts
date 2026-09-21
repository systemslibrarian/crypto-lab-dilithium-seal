/**
 * The selected ML-DSA parameter set, shared across the whole demo.
 *
 * It used to be a module-local variable in `tab1-sign-verify.ts`, reset to
 * ML-DSA-65 every time that tab re-rendered. Two consequences:
 *
 *   - A reader who chose ML-DSA-44, went to Compare, and came back found
 *     themselves on ML-DSA-65 again with no explanation.
 *   - Nothing outside tab 1 could know what was selected, so the benchmark
 *     measured three parameter sets with no indication which one the reader
 *     had actually chosen, and the exported evidence did not record it.
 *
 * A signature, a size, a security category and a timing are all statements
 * about *one* parameter set. If the page holds more than one idea of which set
 * that is, at least one of those statements is about something the reader did
 * not choose.
 *
 * So there is one value, and everything that depends on it subscribes.
 */

import type { MLDSAVariant } from '../crypto/mldsa';

/** The default a first-time visitor meets. */
export const DEFAULT_VARIANT: MLDSAVariant = 'ml-dsa-65';

let selected: MLDSAVariant = DEFAULT_VARIANT;

type Listener = (variant: MLDSAVariant) => void;
const listeners = new Set<Listener>();

export function getSelectedVariant(): MLDSAVariant {
  return selected;
}

/** Human-facing label, e.g. "ML-DSA-65". */
export function variantLabel(variant: MLDSAVariant = selected): string {
  return variant.toUpperCase();
}

/**
 * Change the selection and tell everything that depends on it.
 *
 * A no-op when the value is unchanged, so a re-render cannot cascade into
 * listeners that reset state the reader is in the middle of using.
 */
export function setSelectedVariant(variant: MLDSAVariant): boolean {
  if (variant === selected) return false;
  selected = variant;
  for (const listener of listeners) listener(selected);
  return true;
}

/**
 * Subscribe to changes. Returns an unsubscribe function.
 *
 * Panels are destroyed and rebuilt by tab switches, so a subscriber that never
 * unsubscribed would keep a detached DOM node alive and write into it forever.
 */
export function onVariantChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: restore the default without reloading the page. */
export function resetSelectedVariant(): void {
  selected = DEFAULT_VARIANT;
  for (const listener of listeners) listener(selected);
}

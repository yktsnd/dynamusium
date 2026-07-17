/**
 * Canonical mappings from numbers to visual attributes. All visual layers
 * must use these — no component may invent its own scaling.
 *
 * Encodings:
 * - quantity  -> vessel fill fraction (linear vs displayCapacity)
 * - rate      -> channel stroke width (sqrt, so area reads roughly linearly)
 * - rate      -> particle emission frequency (via integrated rate / quantum)
 * - direction -> particle travel direction + chevrons
 */

export const CHANNEL_MIN_WIDTH = 1.25;
export const CHANNEL_MAX_WIDTH = 9;

/** Rate (amount/s) -> stroke width in px. `rateScale` is the rate mapped to full width. */
export function rateToWidth(rate: number, rateScale: number): number {
  const r = Math.abs(rate);
  if (r <= 0) return CHANNEL_MIN_WIDTH;
  const u = Math.min(1, Math.sqrt(r / rateScale));
  return CHANNEL_MIN_WIDTH + u * (CHANNEL_MAX_WIDTH - CHANNEL_MIN_WIDTH);
}

/** A channel with |rate| below this fraction of the scale renders as inactive. */
export const INACTIVE_RATE_FRACTION = 0.004;

/** Quantity -> fill fraction of a vessel (clamped 0..1). */
export function quantityToFill(quantity: number, capacity: number): number {
  return Math.min(1, Math.max(0, quantity / capacity));
}

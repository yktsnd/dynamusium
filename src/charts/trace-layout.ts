/**
 * Shared horizontal layout fractions for the quantities/rates trace strips
 * and the time-axis scrubber beneath them.
 *
 * Both the trace SVGs (viewBox width NOMINAL_W, stretched to 100% width via
 * preserveAspectRatio="none") and the axis (a plain HTML range input padded
 * with these same fractions of its own 100%-width box) sit directly inside
 * `.instrument-block`, so expressing margins as fractions of that shared
 * width keeps the playback cursor in the traces aligned with the axis thumb
 * at any viewport width between the 1100px composition floor and the
 * 1560px field cap — without measuring pixels.
 */

/** Nominal viewBox width traces render at; margins below are in these units. */
export const TRACE_NOMINAL_W = 1000;

/** Left gutter reserved for far-left y tick numbers. */
export const TRACE_LEFT_MARGIN = 34;

/** Right-edge column reserved for the live readout (symbol + current value).
 * Wide enough for the longest process label ("C → output") plus its value
 * without the two colliding at typical strip widths. */
export const TRACE_READOUT_WIDTH = 128;

/** Breathing room between the plotted line and the readout column. */
export const TRACE_RIGHT_GAP = 8;

export const TRACE_LEFT_FRACTION = TRACE_LEFT_MARGIN / TRACE_NOMINAL_W;
export const TRACE_RIGHT_FRACTION = (TRACE_READOUT_WIDTH + TRACE_RIGHT_GAP) / TRACE_NOMINAL_W;

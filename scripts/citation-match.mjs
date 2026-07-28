/**
 * Shared title-matching rule for citation verification.
 *
 * Used by both the online verifier (scripts/verify-citations.mjs) and the
 * offline guard (tests/museum/citations.test.ts) so the two can never
 * disagree about what counts as a match.
 */

/**
 * Every plausible title portion of a displayed citation label.
 *
 * Labels read "Authors, Title", but the author list itself contains commas
 * ("Field, Kőrös & Noyes, Oscillations in chemical systems II") and titles
 * may contain them too, so there is no single reliable split point. Rather
 * than guess, this returns the label and each of its comma-delimited
 * suffixes; a match against any one of them is enough to show the link
 * points at the cited work.
 */
export const citationTitleCandidates = (label) => {
  const split = [label];
  for (let i = label.indexOf(', '); i !== -1; i = label.indexOf(', ', i + 1)) {
    split.push(label.slice(i + 2));
  }
  // A parenthetical aside is a locator, not a title claim -- "(Los Alamos
  // report LA-1940)" identifies where to find the work, and the publisher
  // has no reason to repeat it in the registered title.
  return split.flatMap((candidate) => {
    const withoutAside = candidate.replace(/\s*\([^)]*\)/g, '').trim();
    return withoutAside && withoutAside !== candidate ? [candidate, withoutAside] : [candidate];
  });
};

/** The most likely title portion, for human-readable mismatch messages. */
export const citationTitle = (label) => {
  const candidates = citationTitleCandidates(label);
  return candidates[candidates.length - 1] ?? label;
};

/**
 * Normalizes a title for comparison: publisher metadata carries HTML tags,
 * entities, diacritics, and inconsistent punctuation that carry no meaning
 * for identifying the work.
 */
const normalize = (title) =>
  title
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * True when the publisher's registered title supports the title the museum
 * displays.
 *
 * Displayed labels are routinely shortened -- "Free Energy of a Nonuniform
 * System I" for a paper registered as "Free Energy of a Nonuniform System.
 * I. Interfacial Free Energy" -- so this asks whether every word of the
 * displayed title appears in the registered one, not whether the two are
 * equal. Shortening a title is honest; naming a different paper is not, and
 * that is what this catches.
 */
export const resolvedTitleSupportsLabel = (label, resolvedTitle) => {
  const actual = new Set(normalize(resolvedTitle).split(' ').filter(Boolean));
  if (actual.size === 0) return false;
  return citationTitleCandidates(label).some((candidate) => {
    const claimed = normalize(candidate).split(' ').filter(Boolean);
    return claimed.length > 0 && claimed.every((word) => actual.has(word));
  });
};

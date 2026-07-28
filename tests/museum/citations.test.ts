import { describe, expect, it } from 'vitest';
import { works } from '../../src/museum/catalog.ts';
import ledger from '../../src/works/verified-citations.json' with { type: 'json' };
import {
  citationTitleCandidates,
  resolvedTitleSupportsLabel,
  // @ts-expect-error -- plain-JS helper shared with scripts/verify-citations.mjs
} from '../../scripts/citation-match.mjs';

/**
 * A source link that opens a different paper than the one named is the most
 * damaging error this museum can make, and it is invisible to every check
 * that looks at the URL alone: a wrong DOI is still a well-formed https URL.
 *
 * These tests pin every citation to the publisher metadata recorded by
 * `npm run cite:verify`. They run offline, so a DOI changed without
 * re-verifying it fails here rather than reaching a visitor.
 */
describe('citation integrity', () => {
  const entries = new Map(ledger.entries.map((entry) => [entry.url, entry]));

  it('records a verification for every citation the museum displays', () => {
    for (const work of works) {
      for (const citation of work.citations) {
        expect(
          entries.has(citation.url),
          `${work.slug} cites ${citation.url}, which has no entry in ` +
            'src/works/verified-citations.json. Run `npm run cite:verify -- --write`.',
        ).toBe(true);
      }
    }
  });

  it('displays a title the publisher metadata actually supports', () => {
    for (const work of works) {
      for (const citation of work.citations) {
        const entry = entries.get(citation.url);
        if (!entry || entry.resolution !== 'crossref') continue;
        expect(
          entry.label,
          `${work.slug}: the catalog label changed but the ledger was not re-verified`,
        ).toBe(citation.label);
        if (entry.note) continue;
        expect(
          resolvedTitleSupportsLabel(citation.label, entry.resolvedTitle),
          `${work.slug} displays "${citation.label}" but ${citation.url} ` +
            `registers "${entry.resolvedTitle}"`,
        ).toBe(true);
      }
    }
  });

  it('never points two works at the same source', () => {
    // Two works sharing a DOI is the signature of a copy-pasted catalog
    // entry, which is how a citation ends up describing the wrong system.
    const seen = new Map<string, string>();
    for (const work of works) {
      for (const citation of work.citations) {
        const previous = seen.get(citation.url);
        expect(previous, `${work.slug} and ${previous} both cite ${citation.url}`).toBeUndefined();
        seen.set(citation.url, work.slug);
      }
    }
  });

  it('cites resolvable, permanent sources', () => {
    for (const work of works) {
      for (const citation of work.citations) {
        expect(citation.url, work.slug).toMatch(/^https:\/\//);
        // A citation whose label carries no title tells the visitor nothing
        // about what they are about to open.
        expect(citation.label.length, work.slug).toBeGreaterThan(12);
      }
    }
  });

  it('every ledger entry still corresponds to a work in the catalog', () => {
    // The verifier reads citations out of the catalog source; this catches
    // the case where it silently missed one, or where a work was removed.
    const live = new Set(works.flatMap((work) => work.citations.map((c) => c.url)));
    for (const entry of ledger.entries) {
      expect(
        live.has(entry.url),
        `ledger lists ${entry.url} (${entry.slug}), no longer cited`,
      ).toBe(true);
    }
    expect(ledger.entries.length).toBe(live.size);
  });
});

describe('citation title matching', () => {
  // The matcher is the guard itself, so its known-wrong cases are pinned
  // here: these are the three DOIs that shipped pointing at other papers.
  it.each([
    [
      'Stachowiak & Okada, A numerical analysis of chaos in the double pendulum',
      'Some properties of attractors and quasi-attractors',
    ],
    [
      'Chirikov, A universal instability of many-dimensional oscillator systems',
      'Dimensional regularization and renormalization of Coulomb gauge quantum electrodynamics',
    ],
    [
      'Prigogine & Lefever, Symmetry breaking instabilities',
      'On the Evaluation of the Thermal-Diffusion Coefficient of Heavy Particles',
    ],
  ])('rejects a label whose source is a different paper (%s)', (label, resolved) => {
    expect(resolvedTitleSupportsLabel(label, resolved)).toBe(false);
  });

  it.each([
    [
      'Stachowiak & Okada, A numerical analysis of chaos in the double pendulum',
      'A numerical analysis of chaos in the double pendulum',
    ],
    // Author lists contain commas, so the title is not simply "after the first comma".
    [
      'Field, Kőrös & Noyes, Oscillations in chemical systems II',
      'Oscillations in chemical systems. II. Thorough analysis of temporal oscillation in the bromate-cerium-malonic acid system',
    ],
    // A parenthetical report number is a locator, not part of the title.
    [
      'Fermi, Pasta, Ulam & Tsingou, Studies of Nonlinear Problems (Los Alamos report LA-1940)',
      'STUDIES OF THE NONLINEAR PROBLEMS',
    ],
    // Displayed titles are routinely shortened; that is honest.
    [
      'Cahn & Hilliard, Free Energy of a Nonuniform System I',
      'Free Energy of a Nonuniform System. I. Interfacial Free Energy',
    ],
    ['Schrödinger, Quantisierung als Eigenwertproblem', 'Quantisierung als Eigenwertproblem'],
  ])('accepts a label the publisher metadata supports (%s)', (label, resolved) => {
    expect(resolvedTitleSupportsLabel(label, resolved)).toBe(true);
  });

  it('offers the label itself and each comma-delimited suffix as a title', () => {
    expect(citationTitleCandidates('Lorenz, Deterministic Nonperiodic Flow')).toContain(
      'Deterministic Nonperiodic Flow',
    );
  });
});

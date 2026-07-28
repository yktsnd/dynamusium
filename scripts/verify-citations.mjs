/**
 * Re-verifies every catalog citation against the publisher's own metadata.
 *
 * A source link that opens the wrong paper is the most damaging error this
 * museum can make, and it is invisible to type checking: a DOI is a
 * well-formed https URL whether or not it points at the cited work. This
 * script resolves each DOI through the CrossRef API and compares the
 * publisher's registered title against the title the museum displays.
 *
 * Usage:
 *   node scripts/verify-citations.mjs           # verify, exit 1 on mismatch
 *   node scripts/verify-citations.mjs --write   # refresh the ledger
 *
 * The ledger it maintains (src/works/verified-citations.json) is what the
 * offline test in tests/museum/citations.test.ts asserts against, so a DOI
 * edited without re-running this script fails the build rather than
 * shipping unverified.
 *
 * Requires network access, so it is deliberately not part of `npm run check`.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { citationTitle, resolvedTitleSupportsLabel } from './citation-match.mjs';

const LEDGER = new URL('../src/works/verified-citations.json', import.meta.url);
const write = process.argv.includes('--write');

const doiOf = (url) => {
  const match = /^https:\/\/doi\.org\/(10\..+)$/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
};

const crossref = async (doi) => {
  const response = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    // CrossRef asks callers to identify themselves; being polite keeps us
    // out of the rate-limited pool.
    {
      headers: {
        'User-Agent': 'DynaMusium citation verifier (https://github.com/yktsnd/dynamusium)',
      },
    },
  );
  if (!response.ok) throw new Error(`CrossRef HTTP ${response.status}`);
  const message = (await response.json()).message;
  return {
    title: (message.title ?? [''])[0] ?? '',
    authors: (message.author ?? []).map((a) => a.family).filter(Boolean),
    year: (message.issued?.['date-parts'] ?? [[null]])[0][0] ?? null,
    container: (message['container-title'] ?? [''])[0] ?? '',
  };
};

/**
 * Reads the citations straight from source rather than importing the
 * catalog, which uses Vite's `import.meta.glob` and cannot be loaded by
 * plain Node. The offline test cross-checks this ledger against the real
 * runtime catalog, so a citation this parser missed fails there.
 */
const readCitations = async () => {
  const source = await readFile(new URL('../src/museum/catalog.ts', import.meta.url), 'utf8');
  const found = [];
  const slugs = [...source.matchAll(/slug:\s*'([^']+)'/g)].map((m) => ({
    slug: m[1],
    at: m.index,
  }));
  for (const match of source.matchAll(/citation:\s*\[([\s\S]*?)\]/g)) {
    // Labels containing an apostrophe (d'Alembert) are double-quoted, so
    // both quote styles have to be recognized -- missing one silently drops
    // a citation from verification.
    const parts = [...match[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      (m[1] ?? m[2]).replace(/\\(['"])/g, '$1'),
    );
    if (parts.length < 2) continue;
    const owner = slugs.filter((s) => s.at < match.index).pop();
    if (!owner) continue;
    found.push({ slug: owner.slug, label: parts[0], url: parts[1] });
  }

  const communityDir = new URL('../src/works/community/', import.meta.url);
  for (const file of await readdir(communityDir)) {
    if (!file.endsWith('.json')) continue;
    const manifest = JSON.parse(await readFile(new URL(file, communityDir), 'utf8'));
    for (const citation of manifest.citations ?? []) {
      found.push({ slug: manifest.slug, label: citation.label, url: citation.url });
    }
  }
  return found;
};

const works = await readCitations();
const existing = JSON.parse(await readFile(LEDGER, 'utf8'));
const notes = new Map(existing.entries.map((e) => [e.url, e.note]).filter(([, n]) => n));

const entries = [];
const problems = [];

for (const citation of works) {
  const doi = doiOf(citation.url);
  if (!doi) {
    // Non-DOI sources (library scans, institutional archives) carry no
    // machine-readable title, so they are recorded and checked by hand.
    entries.push({
      slug: citation.slug,
      url: citation.url,
      label: citation.label,
      resolution: 'manual',
      ...(notes.has(citation.url) ? { note: notes.get(citation.url) } : {}),
    });
    continue;
  }

  let resolved;
  try {
    resolved = await crossref(doi);
  } catch (error) {
    problems.push(`${citation.slug}: ${citation.url} -> ${error.message}`);
    continue;
  }

  const note = notes.get(citation.url);
  if (!resolvedTitleSupportsLabel(citation.label, resolved.title) && !note) {
    problems.push(
      `${citation.slug}: label claims "${citationTitle(citation.label)}" but ` +
        `${citation.url} registers "${resolved.title}"`,
    );
  }

  entries.push({
    slug: citation.slug,
    url: citation.url,
    label: citation.label,
    resolution: 'crossref',
    resolvedTitle: resolved.title,
    resolvedAuthors: resolved.authors,
    resolvedYear: resolved.year,
    resolvedContainer: resolved.container,
    ...(note ? { note } : {}),
  });

  // Stay well inside CrossRef's courtesy rate limit.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

if (write) {
  await writeFile(
    LEDGER,
    `${JSON.stringify({ verifiedAt: new Date().toISOString().slice(0, 10), entries }, null, 2)}\n`,
  );
  console.log(`wrote ${entries.length} entries to src/works/verified-citations.json`);
}

for (const problem of problems) console.error(`MISMATCH ${problem}`);
console.log(`${entries.length} citations checked, ${problems.length} problems`);
process.exit(problems.length > 0 ? 1 : 0);

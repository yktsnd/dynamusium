import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('src/works/community');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
const slugs = new Set();
const failures = [];

for (const file of files) {
  const manifest = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
  const required = [
    'schemaVersion',
    'slug',
    'title',
    'gallery',
    'runtime',
    'kernel',
    'summary',
    'equation',
    'parameters',
    'presets',
    'citations',
  ];
  for (const key of required) if (!(key in manifest)) failures.push(`${file}: missing ${key}`);
  if (manifest.schemaVersion !== 1) failures.push(`${file}: schemaVersion must be 1`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug ?? ''))
    failures.push(`${file}: invalid slug`);
  if (slugs.has(manifest.slug)) failures.push(`${file}: duplicate slug ${manifest.slug}`);
  slugs.add(manifest.slug);
  if (!Array.isArray(manifest.parameters) || manifest.parameters.length < 2)
    failures.push(`${file}: at least two parameters required`);
  if (!Array.isArray(manifest.presets) || manifest.presets.length < 3)
    failures.push(`${file}: at least three presets required`);
  if (
    !Array.isArray(manifest.citations) ||
    !manifest.citations.some((citation) => /^https:\/\//.test(citation.url ?? ''))
  )
    failures.push(`${file}: HTTPS citation required`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${files.length} community work manifest${files.length === 1 ? '' : 's'}.`);

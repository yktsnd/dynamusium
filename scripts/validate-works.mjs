import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  formatManifestValidationIssues,
  validateCommunityManifestCollection,
} from '../src/works/manifest-validator.ts';

const directory = path.resolve('src/works/community');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
const entries = [];
const parseIssues = [];

for (const file of files) {
  try {
    entries.push({
      source: file,
      manifest: JSON.parse(await readFile(path.join(directory, file), 'utf8')),
    });
  } catch (error) {
    parseIssues.push({
      source: file,
      path: '/',
      code: 'json.parse',
      message: error instanceof Error ? error.message : 'invalid JSON',
    });
  }
}

const result = validateCommunityManifestCollection(entries);
const issues = [...parseIssues, ...(result.ok ? [] : result.issues)];
if (issues.length) {
  console.error(formatManifestValidationIssues(issues));
  process.exit(1);
}

console.log(`Validated ${files.length} community work manifest${files.length === 1 ? '' : 's'}.`);

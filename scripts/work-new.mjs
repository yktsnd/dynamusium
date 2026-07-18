import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const slug = process.argv[2];
const title = process.argv.slice(3).join(' ') || slug;
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run work:new -- <kebab-case-slug> [Display title]');
  process.exit(1);
}

const manifest = {
  schemaVersion: 1,
  slug,
  title,
  subtitle: 'A concise curatorial subtitle',
  gallery: 'motion-chaos',
  runtime: 'ode-v1',
  render: 'phase',
  kernel: slug,
  tier: 'collection',
  year: 'YYYY',
  authors: ['Model author'],
  summary:
    'Explain what the model reveals, why its behavior matters, and what visitors can observe.',
  question: 'What precise scientific question should a visitor carry into this work?',
  equation: 'dx/dt = f(x, p)',
  duration: 30,
  parameters: [
    { id: 'control', label: 'Control', symbol: 'p', min: 0, max: 2, step: 0.01, default: 1 },
    {
      id: 'initial',
      label: 'Initial state',
      symbol: 'x₀',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.2,
    },
  ],
  presets: [
    { id: 'canonical', label: 'Canonical', values: {} },
    { id: 'quiet', label: 'Quiet regime', values: { control: 0.4 } },
    { id: 'threshold', label: 'Near threshold', values: { control: 1.2 } },
  ],
  citations: [
    { label: 'Primary or canonical scientific source', url: 'https://doi.org/replace-me' },
  ],
};

const directory = path.resolve('src/works/community');
const target = path.join(directory, `${slug}.json`);
await mkdir(directory, { recursive: true });
await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(`Created ${path.relative(process.cwd(), target)}`);
console.log('Register its kernel in src/museum/simulation.ts, then run npm run work:validate.');

import { spawnSync } from 'node:child_process';
const suites = [
  ['-r', '--if-present', 'test'],
  ['--dir', 'apps/public-site', 'test:unit'],
  ['--dir', 'apps/marketplace', 'test:unit'],
];
let failed = false;
for (const args of suites) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;

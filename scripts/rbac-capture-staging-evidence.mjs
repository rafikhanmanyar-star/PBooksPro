import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('docs/security/staging-evidence');
mkdirSync(dir, { recursive: true });

const runs = [
  ['bootstrap-idempotent', ['--tenant', 'test-company', '--env', 'staging', '--bootstrap']],
  ['parity-test-company', ['--tenant', 'test-company', '--env', 'staging', '--parity']],
  ['sod-test-company', ['--tenant', 'test-company', '--env', 'staging', '--sod-report']],
  ['parity-test2', ['--tenant', 'test2', '--env', 'staging', '--parity']],
  ['sod-test2', ['--tenant', 'test2', '--env', 'staging', '--sod-report']],
];

for (const [name, args] of runs) {
  const r = spawnSync('node', ['--import', 'tsx', 'scripts/rbac-assess-tenant.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
  });
  const out = `${r.stdout}\n${r.stderr}\nEXIT:${r.status}`;
  writeFileSync(resolve(dir, `${name}.txt`), out);
  console.log(name, 'exit', r.status);
}

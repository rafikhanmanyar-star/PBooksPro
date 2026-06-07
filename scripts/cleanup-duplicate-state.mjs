#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walkTsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules' && ent.name !== 'dist') {
      out.push(...walkTsFiles(p));
    } else if (/\.(tsx?|ts)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walkTsFiles(ROOT).filter(
  (f) => !f.includes('node_modules') && !f.includes(`${path.sep}dist${path.sep}`)
);

let fixed = 0;

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  // Remove duplicate: const foo = useFoo(); ... const { foo } = state;
  c = c.replace(
    /(\s*)const (\w+) = (use\w+\([^)]*\));\s*\n\s*const \{ \2(?:: \w+)? \} = state;\s*\n/g,
    '$1const $2 = $3;\n'
  );

  // Same with flexible indentation between lines
  c = c.replace(
    /const (\w+) = (use\w+\([^)]*\));\s*\r?\n\s*const \{ \1(?:: \w+)? \} = state;\s*\r?\n/g,
    'const $1 = $2;\n'
  );

  c = c.replace(
    /const (\w+) = (use\w+\([^)]*\));\s*\r?\n\s*const \{ \1: (\w+) \} = state;\s*\r?\n/g,
    'const $3 = $1;\n'
  );

  // Dedupe identical consecutive import lines
  c = c.replace(
    /(import \{[^}]+\} from '[^']+';\n)\1+/g,
    '$1'
  );

  if (c !== orig) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('fixed', rel);
    fixed++;
  }
}

console.log(`cleanup done: ${fixed} files`);

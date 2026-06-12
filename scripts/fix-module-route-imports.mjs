#!/usr/bin/env node
/** Fix dynamic import paths missed by bulk route migration. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'src', 'modules');

const TOP_LEVEL = ['db', 'middleware', 'services', 'utils', 'financial', 'auth', 'constants', 'adminPortal', 'core'];

function fixContent(content) {
  let result = content;
  for (const seg of TOP_LEVEL) {
    const re1 = new RegExp(`import\\('\\.\\.\\/${seg}\\/`, 'g');
    const re2 = new RegExp(`import\\("\\.\\.\\/${seg}\\/`, 'g');
    result = result.replace(re1, `import('../../../${seg}/`);
    result = result.replace(re2, `import("../../../${seg}/`);
    // multiline dynamic import
    const re3 = new RegExp(`import\\(\\s*\\n\\s*'\\.\\.\\/${seg}\\/`, 'g');
    result = result.replace(re3, `import(\n          '../../../${seg}/`);
  }
  return result;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.ts') && p.includes(`${path.sep}routes${path.sep}`)) {
      const before = fs.readFileSync(p, 'utf8');
      const after = fixContent(before);
      if (after !== before) {
        fs.writeFileSync(p, after, 'utf8');
        console.log('[fixed]', path.relative(root, p));
      }
    }
  }
}

walk(root);
console.log('Done.');

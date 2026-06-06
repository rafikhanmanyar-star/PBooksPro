/**
 * C6: Replace useAppContext() with useFullAppState() + useDispatchOnly() in components/hooks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SKIP = new Set([
  'context/AppContext.tsx',
  'context/KPIContext.tsx',
  'context/NotificationContext.tsx',
  'context/domains/financeDomain.ts',
  'hooks/useSelectiveState.ts',
  'components/personalTransactions/personalTransactionsService.ts',
]);

function hookImportPath(rel) {
  const depth = rel.split(/[/\\]/).length - 1;
  return '../'.repeat(depth) + 'hooks/useSelectiveState';
}

function migrateFile(rel) {
  if (SKIP.has(rel.replace(/\\/g, '/'))) return false;
  const fp = path.join(root, rel);
  let src = fs.readFileSync(fp, 'utf8');
  if (!src.includes('useAppContext')) return false;

  const hp = hookImportPath(rel);

  // Remove AppContext import
  src = src.replace(/import\s+\{[^}]*useAppContext[^}]*\}\s+from\s+['"][^'"]*AppContext['"];\s*\n?/g, '');

  const hooksNeeded = new Set();
  let needsDispatch = false;
  let needsState = false;

  // Detect destructuring patterns
  const patterns = [
    /\{\s*state\s*:\s*(\w+)\s*,\s*dispatch\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/g,
    /\{\s*dispatch\s*:\s*(\w+)\s*,\s*state\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/g,
    /\{\s*state\s*:\s*(\w+)\s*,\s*dispatch\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/g,
    /\{\s*state\s*,\s*dispatch\s*\}\s*=\s*useAppContext\(\)/g,
    /\{\s*dispatch\s*,\s*state\s*\}\s*=\s*useAppContext\(\)/g,
    /\{\s*state\s*\}\s*=\s*useAppContext\(\)/g,
    /\{\s*dispatch\s*\}\s*=\s*useAppContext\(\)/g,
  ];

  if (/\bdispatch\b/.test(src.replace(/useAppContext\(\)/g, ''))) {
    // may need dispatch if used after migration
  }

  let replacement = '';
  if (src.match(/\{\s*state\s*:\s*(\w+)\s*,\s*dispatch\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/)) {
    src = src.replace(
      /\{\s*state\s*:\s*(\w+)\s*,\s*dispatch\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/g,
      (_, stateAlias, dispatchAlias) => {
        hooksNeeded.add('useFullAppState');
        hooksNeeded.add('useDispatchOnly');
        return `const ${stateAlias} = useFullAppState();\n    const ${dispatchAlias} = useDispatchOnly()`;
      }
    );
  } else if (src.match(/\{\s*dispatch\s*:\s*(\w+)\s*,\s*state\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/)) {
    src = src.replace(
      /\{\s*dispatch\s*:\s*(\w+)\s*,\s*state\s*:\s*(\w+)\s*\}\s*=\s*useAppContext\(\)/g,
      (_, dispatchAlias, stateAlias) => {
        hooksNeeded.add('useFullAppState');
        hooksNeeded.add('useDispatchOnly');
        return `const ${stateAlias} = useFullAppState();\n    const ${dispatchAlias} = useDispatchOnly()`;
      }
    );
  } else if (src.includes('{ state, dispatch } = useAppContext()')) {
    src = src.replace(
      /\{\s*state\s*,\s*dispatch\s*\}\s*=\s*useAppContext\(\)/g,
      'const state = useFullAppState();\n    const dispatch = useDispatchOnly()'
    );
    hooksNeeded.add('useFullAppState');
    hooksNeeded.add('useDispatchOnly');
  } else if (src.includes('{ dispatch, state } = useAppContext()')) {
    src = src.replace(
      /\{\s*dispatch\s*,\s*state\s*\}\s*=\s*useAppContext\(\)/g,
      'const state = useFullAppState();\n    const dispatch = useDispatchOnly()'
    );
    hooksNeeded.add('useFullAppState');
    hooksNeeded.add('useDispatchOnly');
  } else if (src.match(/\{\s*state\s*\}\s*=\s*useAppContext\(\)/)) {
    src = src.replace(/\{\s*state\s*\}\s*=\s*useAppContext\(\)/g, 'const state = useFullAppState()');
    hooksNeeded.add('useFullAppState');
  } else if (src.match(/\{\s*dispatch\s*\}\s*=\s*useAppContext\(\)/)) {
    src = src.replace(/\{\s*dispatch\s*\}\s*=\s*useAppContext\(\)/g, 'const dispatch = useDispatchOnly()');
    hooksNeeded.add('useDispatchOnly');
  } else {
    return false;
  }

  if (src.includes('useAppContext')) return false;

  // Add selective state import
  const hookList = [...hooksNeeded].sort();
  if (hookList.length === 0) return false;

  const importLine = `import { ${hookList.join(', ')} } from '${hp}';\n`;
  const existingImport = src.match(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]*useSelectiveState['"];/);
  if (existingImport) {
    const merged = new Set([
      ...existingImport[1].split(',').map((h) => h.trim()).filter(Boolean),
      ...hookList,
    ]);
    src = src.replace(
      existingImport[0],
      `import { ${[...merged].sort().join(', ')} } from '${hp}';`
    );
  } else {
    const firstImport = src.search(/^import\s/m);
    if (firstImport >= 0) {
      src = src.slice(0, firstImport) + importLine + src.slice(firstImport);
    } else {
      src = importLine + src;
    }
  }

  fs.writeFileSync(fp, src);
  return true;
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    const rel = path.relative(root, p).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(ent.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

let count = 0;
for (const rel of walk(root)) {
  if (migrateFile(rel)) {
    count++;
    console.log('migrated', rel);
  }
}
console.log(`Done: ${count} files migrated`);

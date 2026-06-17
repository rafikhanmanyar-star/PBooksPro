#!/usr/bin/env node
/**
 * PBooks Pro Tenant Import — desktop on-prem only.
 * Copies an organization from cloud production PostgreSQL into the local API Server database.
 *
 * Target DATABASE_URL is read from PBooks Pro API Server AppData backend/.env.
 * Cloud source URL: prompted, or cloud-source.env beside the EXE / in AppData.
 *
 * Usage (dev): npm run tenant-import
 * Build EXE:    npm run build:tenant-import-exe
 */

'use strict';

const readline = require('readline');
const path = require('path');
const fs = require('fs');

const {
  copyTenantPostgresToPostgres,
  listMatchingTenants,
  maskUrl,
  GL_REPAIR_TABLES,
  GL_REPAIR_WIPE_TABLES,
} = require('../../scripts/lib/tenant-postgres-copy-core.cjs');
const {
  resolveLocalDatabaseUrlFromApiServer,
  resolveCloudSourceUrlFromFile,
  ensureTenantImportConfigDir,
  listLocalEnvCandidates,
  parseEnvFile,
} = require('./resolve-api-env.cjs');

const VERSION = '1.0.0';

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

function pause(message) {
  if (!process.stdin.isTTY) return Promise.resolve();
  const rl = createRl();
  return ask(rl, message || '\nPress Enter to exit...').finally(() => rl.close());
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, nonInteractive: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--source-url' && args[i + 1]) out.sourceUrl = args[++i];
    else if (a === '--source-tenant' && args[i + 1]) out.sourceTenant = args[++i];
    else if (a === '--target-url' && args[i + 1]) out.targetUrl = args[++i];
    else if (a === '--target-env' && args[i + 1]) out.targetEnv = args[++i];
    else if (a === '--tenant-query' && args[i + 1]) out.tenantQuery = args[++i];
    else if (a === '--non-interactive') out.nonInteractive = true;
    else if (a === '--repair-gl') out.repairGl = true;
  }
  return out;
}

async function pickTenant(rl, sourceUrl, query) {
  console.log('\nSearching cloud organizations…');
  const rows = await listMatchingTenants(sourceUrl, query || '%');
  if (!rows.length) {
    throw new Error(`No organization matched "${query || ''}" on cloud production.`);
  }
  if (rows.length === 1) {
    console.log(`\nFound: ${rows[0].display_name} (${rows[0].id})`);
    const ok = await ask(rl, 'Use this organization? [Y/n]: ');
    if (ok && /^n/i.test(ok)) throw new Error('Cancelled.');
    return rows[0].id;
  }
  console.log('\nMatching organizations:');
  rows.forEach((t, i) => {
    console.log(
      `  ${i + 1}. ${t.display_name}  id=${t.id}` + (t.email ? `  email=${t.email}` : '')
    );
  });
  const pick = await ask(rl, `\nEnter number (1-${rows.length}) or exact tenant id: `);
  const n = Number(pick);
  if (Number.isInteger(n) && n >= 1 && n <= rows.length) return rows[n - 1].id;
  const exact = rows.find((r) => r.id === pick);
  if (exact) return exact.id;
  throw new Error('Invalid selection.');
}

async function main() {
  console.log('='.repeat(70));
  console.log('  PBooks Pro Tenant Import (desktop on-prem)');
  console.log('  Version', VERSION);
  if (cli.repairGl) console.log('  ** General ledger repair mode **');
  console.log('='.repeat(70));
  if (cli.repairGl) {
    console.log(
      '\nRe-imports GL data only (accounts, journal entries/lines, periods) from cloud.\n' +
        'Does NOT wipe invoices, bills, projects, or other business data.\n' +
        'Stop the PBooks Pro API Server before running.\n'
    );
  } else {
    console.log(
      '\nImports an organization from cloud production into this PC\'s PostgreSQL database.'
    );
    console.log('Stop the PBooks Pro API Server before importing.\n');
  }

  const cli = parseCliArgs();
  const rl = cli.nonInteractive ? null : createRl();

  try {
    let targetUrl = cli.targetUrl;
    let targetEnvPath = null;
    if (cli.targetEnv && fs.existsSync(cli.targetEnv)) {
      const parsed = parseEnvFile(cli.targetEnv);
      targetUrl = (parsed.DATABASE_URL || '').trim();
      targetEnvPath = cli.targetEnv;
      if (!targetUrl) {
        throw new Error(`No DATABASE_URL in ${cli.targetEnv}`);
      }
      console.log('Local database (from --target-env):');
      console.log('  Config:', targetEnvPath);
      console.log('  URL:', maskUrl(targetUrl));
    } else if (!targetUrl) {
      const local = resolveLocalDatabaseUrlFromApiServer();
      if (!local) {
        const tried = listLocalEnvCandidates();
        throw new Error(
          'Could not find local DATABASE_URL.\n\n' +
            'Expected API Server config at (first match with DATABASE_URL wins):\n' +
            tried.map((p) => `  - ${p}`).join('\n') +
            '\n\nYour install may use: %APPDATA%\\pbooks-pro\\backend\\.env\n' +
            'Or pass: --target-env "C:\\Users\\...\\AppData\\Roaming\\pbooks-pro\\backend\\.env"'
        );
      }
      targetUrl = local.databaseUrl;
      targetEnvPath = local.envPath;
      console.log('Local database (from API Server config):');
      console.log('  App folder:', local.appFolder);
      console.log('  Config:', targetEnvPath);
      console.log('  URL:', maskUrl(targetUrl));
    } else {
      console.log('Local database URL:', maskUrl(targetUrl));
    }

    let sourceUrl = cli.sourceUrl || process.env.SOURCE_DATABASE_URL || '';
    if (!sourceUrl) {
      const fromFile = resolveCloudSourceUrlFromFile();
      if (fromFile) {
        sourceUrl = fromFile.sourceUrl;
        console.log('\nCloud source URL (from file):', fromFile.filePath);
        console.log('  URL:', maskUrl(sourceUrl));
      }
    }
    if (!sourceUrl && rl) {
      console.log(
        '\nCloud production DATABASE_URL (Render external URL, include ?sslmode=require):'
      );
      console.log('Tip: save as cloud-source.env next to this program for next time.');
      sourceUrl = await ask(rl, 'SOURCE URL: ');
    }
    if (!sourceUrl) {
      throw new Error('Cloud SOURCE DATABASE_URL is required.');
    }
    console.log('\nCloud source:', maskUrl(sourceUrl));

    let sourceTenant = cli.sourceTenant;
    if (!sourceTenant) {
      const query =
        cli.tenantQuery ||
        (rl ? await ask(rl, '\nOrganization name or id to search (e.g. pakland): ') : '');
      if (!query && !cli.nonInteractive) {
        throw new Error('Organization search text is required.');
      }
      if (cli.nonInteractive && cli.sourceTenant) {
        sourceTenant = cli.sourceTenant;
      } else if (cli.nonInteractive) {
        throw new Error('--source-tenant is required with --non-interactive');
      } else {
        sourceTenant = await pickTenant(rl, sourceUrl, query);
      }
    }

    const targetTenant = sourceTenant;
    console.log('\nImport plan:');
    console.log('  Source tenant:', sourceTenant);
    console.log('  Target tenant:', targetTenant, '(same id — preserves logins)');
    if (cli.repairGl) {
      console.log('  Scope: GL repair only —', GL_REPAIR_TABLES.join(', '));
    } else {
      console.log('  Includes: business data, users, RBAC, subscriptions');
    }

    const copyOpts = {
      sourceUrl,
      targetUrl,
      sourceTenant,
      targetTenant,
      dryRun: !!cli.dryRun,
      wipe: !cli.repairGl,
      createTenant: !cli.repairGl,
      repairGl: !!cli.repairGl,
      onlyTables: cli.repairGl ? [...GL_REPAIR_TABLES] : undefined,
      wipeTables: cli.repairGl ? [...GL_REPAIR_WIPE_TABLES] : undefined,
    };

    const dryRunFirst = cli.dryRun;
    if (!dryRunFirst && !cli.yes && rl) {
      const preview = await ask(rl, '\nRun dry-run preview first? [Y/n]: ');
      if (!preview || /^y/i.test(preview)) {
        console.log('\n--- Dry run ---');
        await copyTenantPostgresToPostgres({ ...copyOpts, dryRun: true });
        console.log('--- End dry run ---\n');
      }
    }

    if (!cli.yes && !cli.dryRun && rl) {
      const warnMsg = cli.repairGl
        ? 'WARNING: This will replace journal/GL data on the local DB for this tenant (invoices/bills are kept).\nProceed? [y/N]: '
        : 'WARNING: This will DELETE existing data for this tenant on the local DB and re-import from cloud.\nProceed? [y/N]: ';
      const confirm = await ask(rl, warnMsg);
      if (!/^y/i.test(confirm)) {
        console.log('Cancelled.');
        return;
      }
    }

    await copyTenantPostgresToPostgres(copyOpts);

    if (!cli.dryRun) {
      console.log('\n' + '='.repeat(70));
      console.log(cli.repairGl ? '  GL repair complete.' : '  Import complete.');
      console.log('  1. Start PBooks Pro API Server');
      console.log('  2. Open PBooks Pro Client and sign in with your cloud credentials');
      console.log('='.repeat(70));

      const cfgDir = ensureTenantImportConfigDir();
      const examplePath = path.join(cfgDir, 'cloud-source.env.example');
      if (!fs.existsSync(examplePath)) {
        fs.writeFileSync(
          examplePath,
          '# Copy to cloud-source.env (same folder or next to PBooksPro-TenantImport.exe)\nSOURCE_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require\n',
          'utf8'
        );
      }
    }
  } finally {
    if (rl) rl.close();
  }
}

main()
  .catch((err) => {
    console.error('\nERROR:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pause());

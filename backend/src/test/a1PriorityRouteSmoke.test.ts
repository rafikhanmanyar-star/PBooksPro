import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type RouteSpec = {
  label: string;
  file: string;
  entityType: string;
  allowsPostCommitQueueOutsideTransaction?: boolean;
};

const PRIORITY_ROUTES: RouteSpec[] = [
  {
    label: 'Invoices',
    file: 'modules/customers/routes/invoicesRoutes.ts',
    entityType: 'invoice',
  },
  {
    label: 'Transactions',
    file: 'modules/accounting/routes/transactionsRoutes.ts',
    entityType: 'transaction',
    allowsPostCommitQueueOutsideTransaction: true,
  },
  {
    label: 'Bills',
    file: 'modules/vendors/routes/billsRoutes.ts',
    entityType: 'bill',
    allowsPostCommitQueueOutsideTransaction: true,
  },
  {
    label: 'Purchase Orders',
    file: 'modules/purchase-orders/routes/purchaseOrdersRoutes.ts',
    entityType: 'purchase_order',
  },
  {
    label: 'Goods Receipts',
    file: 'modules/goods-receipts/routes/goodsReceiptsRoutes.ts',
    entityType: 'goods_receipt',
  },
  {
    label: 'Contracts',
    file: 'modules/project-selling/routes/contractsRoutes.ts',
    entityType: 'contract',
  },
];

function readRouteSource(spec: RouteSpec): string {
  return readFileSync(path.join(backendRoot, spec.file), 'utf8');
}

function countQueueCalls(text: string): number {
  return (text.match(/queueEntityEvent\s*\(/g) ?? []).length;
}

/** Split source into preamble + each withTransaction(async (client) => { ... }); block tail. */
function splitWithTransactionTails(source: string): string[] {
  const parts = source.split('withTransaction(async (client) => {');
  return parts.slice(1).map((part) => {
    const closeIdx = part.indexOf('\n    });');
    return closeIdx === -1 ? part : part.slice(closeIdx);
  });
}

function extractWithTransactionBodies(source: string): string[] {
  const bodies: string[] = [];
  const parts = source.split('withTransaction(async (client) => {');
  for (const part of parts.slice(1)) {
    const closeIdx = part.indexOf('\n    });');
    if (closeIdx === -1) continue;
    bodies.push(part.slice(0, closeIdx));
  }
  return bodies;
}

function hasSuccessGuardBeforeQueue(body: string): boolean {
  const guards = [
    /if\s*\(\s*!\s*\w+\.conflict/,
    /if\s*\(\s*!\s*\w+\.conflict\s*&&/,
    /if\s*\(\s*\w+\.deleted\s*\)/,
    /if\s*\(\s*!\s*\w+\.conflict\s*&&\s*\w+\.ok\s*\)/,
    /if\s*\(\s*\w+\.conflict\s*\|\|\s*!\s*\w+\.row\s*\)\s*return/,
  ];
  return guards.some((re) => re.test(body));
}

for (const spec of PRIORITY_ROUTES) {
  describe(`A1 route smoke — ${spec.label}`, () => {
    const source = readRouteSource(spec);
    const txnBodies = extractWithTransactionBodies(source);
    const queuingBodies = txnBodies.filter((b) => b.includes('queueEntityEvent'));

    it('imports queueEntityEvent and has zero emitEntityEvent', () => {
      assert.match(source, /queueEntityEvent/);
      assert.doesNotMatch(source, /\bemitEntityEvent\b/);
    });

    it('queues primary entity events inside withTransaction callbacks', () => {
      assert.match(
        source,
        new RegExp(
          `withTransaction\\(async \\(client\\)[\\s\\S]*?queueEntityEvent\\([\\s\\S]*?['"]${spec.entityType}['"]`
        )
      );
    });

    it('guards queueEntityEvent behind success inside withTransaction', () => {
      assert.ok(queuingBodies.length > 0, 'expected at least one queuing withTransaction body');
      for (const body of queuingBodies) {
        assert.ok(
          hasSuccessGuardBeforeQueue(body),
          'queueEntityEvent must be behind conflict/deleted/ok guard'
        );
      }
    });

    it('keeps HTTP responses outside withTransaction callback bodies', () => {
      for (const body of txnBodies) {
        assert.doesNotMatch(body, /\bsendSuccess\s*\(/, 'sendSuccess must not run inside withTransaction');
        assert.doesNotMatch(body, /\bsendFailure\s*\(/, 'sendFailure must not run inside withTransaction');
        assert.doesNotMatch(body, /\bsendVersionConflict\s*\(/, 'sendVersionConflict must not run inside withTransaction');
      }
    });

    if (spec.allowsPostCommitQueueOutsideTransaction) {
      it('allows post-COMMIT queueEntityEvent after pool.connect re-read (Pattern 2)', () => {
        assert.match(source, /pool\.connect\(\)[\s\S]*?queueEntityEvent/);
      });
    } else {
      it('keeps all queueEntityEvent calls inside withTransaction blocks', () => {
        const parts = source.split('withTransaction(async (client) => {');
        const preamble = parts[0] ?? '';
        assert.doesNotMatch(preamble, /queueEntityEvent\s*\(/, 'no queue calls before first withTransaction');

        for (const tail of splitWithTransactionTails(source)) {
          assert.doesNotMatch(tail, /queueEntityEvent\s*\(/, 'no queue calls after withTransaction close');
        }

        const totalQueues = countQueueCalls(source);
        const insideQueues = extractWithTransactionBodies(source).reduce(
          (count, body) => count + countQueueCalls(body),
          0
        );
        assert.equal(totalQueues, insideQueues);
      });
    }
  });
}

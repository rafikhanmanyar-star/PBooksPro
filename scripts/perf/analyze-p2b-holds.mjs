#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const logPath = process.argv[2];
const log = readFileSync(logPath, 'utf8');

const re =
  /\[POOL_HOLD\] route="GET \/api\/v1\/([^"]+)" requestId=([^\s]+)\s+acquireAt=(\d+) releaseAt=(\d+) holdMs=(\d+) waitMs=(\d+) atAcquire=\{total:(\d+),idle:(\d+),waiting:(\d+)\}/g;

const holds = [];
let m;
while ((m = re.exec(log)) !== null) {
  holds.push({
    route: m[1],
    requestId: m[2],
    acquireAt: Number(m[3]),
    releaseAt: Number(m[4]),
    holdMs: Number(m[5]),
    waitMs: Number(m[6]),
    total: Number(m[7]),
    idle: Number(m[8]),
    waiting: Number(m[9]),
  });
}

function peakOverlap(events) {
  const pts = [];
  for (const e of events) {
    pts.push({ t: e.acquireAt, d: 1 });
    pts.push({ t: e.releaseAt, d: -1 });
  }
  pts.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let peak = 0;
  for (const p of pts) {
    cur += p.d;
    peak = Math.max(peak, cur);
  }
  return peak;
}

function analyzeBulkRequests(filterPrefix) {
  const bulk = holds.filter((h) => h.route.startsWith('state/bulk-chunked'));
  const byReq = new Map();
  for (const h of bulk) {
    if (!byReq.has(h.requestId)) byReq.set(h.requestId, []);
    byReq.get(h.requestId).push(h);
  }

  const ids = [...byReq.keys()];
  console.log(`\n=== ${filterPrefix ?? 'all'} bulk-chunked requests: ${ids.length} ===`);

  for (const id of ids) {
    const events = byReq.get(id).sort((a, b) => a.acquireAt - b.acquireAt);
    const t0 = events[0].acquireAt;
    const t1 = events[events.length - 1].releaseAt;
    const bulkPeak = peakOverlap(events);

    const windowAll = holds.filter((h) => h.acquireAt >= t0 && h.acquireAt <= t1);
    const processPeak = peakOverlap(windowAll);
    const byRoute = {};
    for (const h of windowAll) byRoute[h.route] = (byRoute[h.route] || 0) + 1;

    console.log(`requestId=${id.slice(0, 8)}… holds=${events.length} bulkPeak=${bulkPeak} processPeak=${processPeak} durationMs=${t1 - t0}`);
    console.log('  byRoute during window:', byRoute);

    // Waterfall: first 15 holds for this bulk request
    console.log('  waterfall (first 15 bulk holds, rel ms from t0):');
    for (const e of events.slice(0, 15)) {
      console.log(
        `    +${String(e.acquireAt - t0).padStart(4)}ms acquire  hold=${e.holdMs}ms wait=${e.waitMs}ms  idle@${e.total - e.idle}/${e.total} waiting=${e.waiting}`
      );
      console.log(
        `    +${String(e.releaseAt - t0).padStart(4)}ms release`
      );
    }
    if (events.length > 15) console.log(`    … +${events.length - 15} more holds`);
  }
}

console.log('Total POOL_HOLD events:', holds.length);
analyzeBulkRequests('from log');

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaginationQuery, buildPaginatedResponse, hasMorePages } from './parsePaginationQuery.js';

test('parsePaginationQuery defaults to page 1 size 50', () => {
  const r = parsePaginationQuery({});
  assert.equal(r.page, 1);
  assert.equal(r.pageSize, 50);
  assert.equal(r.limit, 50);
  assert.equal(r.offset, 0);
});

test('parsePaginationQuery page style', () => {
  const r = parsePaginationQuery({ page: '2', pageSize: '25' });
  assert.equal(r.page, 2);
  assert.equal(r.pageSize, 25);
  assert.equal(r.offset, 25);
});

test('parsePaginationQuery limit offset style', () => {
  const r = parsePaginationQuery({ limit: '100', offset: '200' });
  assert.equal(r.limit, 100);
  assert.equal(r.offset, 200);
  assert.equal(r.page, 3);
});

test('buildPaginatedResponse totals', () => {
  const r = buildPaginatedResponse(['a', 'b'], 120, 1, 50);
  assert.equal(r.totalPages, 3);
  assert.equal(r.totalCount, 120);
});

test('hasMorePages', () => {
  assert.equal(hasMorePages(1, 50, 120), true);
  assert.equal(hasMorePages(3, 50, 120), false);
});

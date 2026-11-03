// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/server.ts';
import { orders, branches, assignments, almatyDate, assignedLoad } from '../src/store.ts';

test('dispatch API: идемпотентность, загрузка и валидация', async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port: number};
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const o = orders[0];
    const results = await Promise.all([1, 2].map(async () => (await fetch(`${url}/orders/${o.id}/assign`, {method: 'POST'})).json()));
    assert.deepEqual(results[0], results[1]);
    assert.equal(assignments.size, 1);
    const assignment = assignments.get(o.id)!;
    if (assignment.branchId) {
      const response = await fetch(`${url}/branches/${assignment.branchId}/load?date=${almatyDate(o.createdAt)}`);
      assert.equal((await response.json() as {assigned: number}).assigned, 1);
      assert.equal(assignedLoad(assignment.branchId, '1999-01-01'), 0);
    }
    for (const date of ['', '?date=2030-02-30', '?date=invalid'])
      assert.equal((await fetch(`${url}/branches/${branches[0].id}/load${date}`)).status, 400);
    assert.equal((await fetch(`${url}/branches/missing/load?date=2030-01-01`)).status, 404);
    assert.equal((await fetch(`${url}/orders/missing/assign`, {method: 'POST'})).status, 404);
    assert.equal(almatyDate('2030-01-01T18:59:59Z'), '2030-01-01');
    assert.equal(almatyDate('2030-01-01T19:00:00Z'), '2030-01-02');
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

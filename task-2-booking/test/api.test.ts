// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/server.ts';
import { normalizePhone } from '../src/bookings.ts';

test('booking API: гонка, нормализация, валидация и отмена', async () => {
  const oldNow = process.env.NOW;
  process.env.NOW = '2030-11-18T00:00:00Z';
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  const post = (body: unknown) => fetch(url + '/bookings', {method: 'POST', body: JSON.stringify(body)});
  const input = {masterId: 'm-1', serviceId: 's-cut', start: '2030-11-18T16:00:00+05:00', clientPhone: '8 (701) 234-56-78'};
  try {
    const responses = await Promise.all([post(input), post({...input, start: '2030-11-18T11:00:00Z'})]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
    const created = await responses.find(r => r.status === 201)!.json() as {id: string; start: string; clientPhone: string};
    assert.equal(created.clientPhone, '+77012345678');
    assert.equal(created.start, '2030-11-18T11:00:00.000Z');
    assert.deepEqual(await responses.find(r => r.status === 409)!.json(), {error: 'slot_unavailable'});
    process.env.NOW = '2030-11-18T09:00:00.001Z';
    assert.equal((await fetch(`${url}/bookings/${created.id}`, {method: 'DELETE'})).status, 409);
    process.env.NOW = '2030-11-18T09:00:00Z';
    assert.equal((await fetch(`${url}/bookings/${created.id}`, {method: 'DELETE'})).status, 200);
    process.env.NOW = '2030-11-18T12:00:00Z';
    assert.equal((await fetch(`${url}/bookings/${created.id}`, {method: 'DELETE'})).status, 200);
    process.env.NOW = '2030-11-18T00:00:00Z';
    assert.equal((await post(input)).status, 201);
    for (const start of ['2030-02-30T16:00:00+05:00', '2030-11-18T16:00:00', 'invalid'])
      assert.equal((await post({...input, start})).status, 400);
    assert.equal((await post({...input, start: '2030-11-18T15:01:00+05:00'})).status, 409);
    assert.equal((await post({...input, clientPhone: '+79991234567'})).status, 400);
    assert.equal((await post({...input, serviceId: 's-mani'})).status, 400);
    assert.equal((await post({...input, masterId: 'missing'})).status, 404);
    assert.equal((await fetch(url + '/bookings', {method: 'POST', body: '{'})).status, 400);
    assert.equal((await fetch(url + '/bookings/missing', {method: 'DELETE'})).status, 404);
    for (const query of ['', '?serviceId=s-cut', '?date=2030-11-18', '?serviceId=s-cut&date=2030-02-30'])
      assert.equal((await fetch(url + '/masters/m-1/slots' + query)).status, 400);
    assert.equal((await fetch(url + '/masters/missing/slots?serviceId=s-cut&date=2030-11-18')).status, 404);
    const slots = await fetch(url + '/masters/m-1/slots?serviceId=s-cut&date=2030-11-18');
    assert.equal(slots.status, 200);
    assert.ok((await slots.json() as {slots: string[]}).slots.includes('11:15'));
    for (const phone of ['+7 701 234 56 78', '87012345678', '8 (701) 234-56-78']) assert.equal(normalizePhone(phone), '+77012345678');
  } finally {
    if (oldNow === undefined) delete process.env.NOW; else process.env.NOW = oldNow;
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

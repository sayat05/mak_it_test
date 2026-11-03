// @rev kc-31
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ApiError, availableSlots, createBooking, cancelBooking } from './bookings.ts';
import { masters, services } from './store.ts';

const port = Number(process.env.PORT ?? 3002);

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/masters') {
      return send(res, 200, masters);
    }

    if (req.method === 'GET' && url.pathname === '/services') {
      return send(res, 200, services);
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'GET' && parts.length === 3 && parts[0] === 'masters' && parts[2] === 'slots')
      return send(res, 200, await availableSlots(parts[1], url.searchParams.get('serviceId'), url.searchParams.get('date')));
    if (req.method === 'POST' && url.pathname === '/bookings')
      return send(res, 201, await createBooking(await readJson(req)));
    if (req.method === 'DELETE' && parts.length === 2 && parts[0] === 'bookings')
      return send(res, 200, await cancelBooking(parts[1]));
    send(res, 404, { error: 'not_found' });
  } catch (err) {
    if (err instanceof ApiError) return send(res, err.status, {error: err.message});
    if (err instanceof SyntaxError) return send(res, 400, {error: 'invalid_json'});
    console.error(err);
    send(res, 500, { error: 'internal' });
  }
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

if (import.meta.main) server.listen(port, () => {
  console.log(`booking: http://localhost:${port}`);
});

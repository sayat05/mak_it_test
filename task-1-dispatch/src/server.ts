// @rev kc-31
import {createServer, type ServerResponse} from 'node:http';
import {branches, orders, assignOrder, assignedLoad} from './store.ts';

const port = Number(process.env.PORT ?? 3001);

export const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
        if (req.method === 'GET' && url.pathname === '/branches') {
            return send(res, 200, branches);
        }

        if (req.method === 'GET' && parts[0] === 'orders' && parts.length === 2) {
            const order = orders.find((o) => o.id === parts[1]);
            if (!order)
                return send(res, 404, {error: 'order_not_found'});
            return send(res, 200, order);
        }

        if (req.method === 'POST' && parts.length === 3 && parts[0] === 'orders' && parts[2] === 'assign') {
            const order = orders.find(o => o.id === parts[1]);
            return order ? send(res, 200, assignOrder(order)) : send(res, 404, {error: 'order_not_found'});
        }
        if (req.method === 'GET' && parts.length === 3 && parts[0] === 'branches' && parts[2] === 'load') {
            const date = url.searchParams.get('date');
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
                return send(res, 400, {error: 'invalid_date'});
            const branch = branches.find(b => b.id === parts[1]);
            if (!branch) return send(res, 404, {error: 'branch_not_found'});
            return send(res, 200, {branchId: branch.id, date, assigned: assignedLoad(branch.id, date), limit: branch.dailyLimit});
        }
        send(res, 404, {error: 'not_found'});
    } catch (err) {
        console.error(err);
        send(res, 500, {error: 'internal'});
    }
});

function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(body));
}

if (import.meta.main) server.listen(port, () => {
    console.log(`dispatch: http://localhost:${port}`);
});

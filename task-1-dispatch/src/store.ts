// @rev kc-31
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Assignment, Branch, Order} from './types.ts';

const dataDir = process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'data');

function load<T>(file: string): T {
    return JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as T;
}

export const branches: Branch[] = load('branches.json');
export const orders: Order[] = load('orders.json');

// orderId -> распределение
export const assignments = new Map<string, Assignment>();

import { assignBranch } from './router.ts';

export function almatyDate(iso: string): string {
    return new Date(Date.parse(iso) + 5 * 3600000).toISOString().slice(0, 10);
}

export function assignedLoad(branchId: string, date: string): number {
    return orders.filter(o => assignments.get(o.id)?.branchId === branchId && almatyDate(o.createdAt) === date).length;
}

export function assignOrder(order: Order): Assignment {
    const previous = assignments.get(order.id);
    if (previous) return previous;
    // No await between checking capacity and reserving it: atomic within this process.
    const assignment = assignBranch(order, branches, id => assignedLoad(id, almatyDate(order.createdAt)));
    assignments.set(order.id, assignment);
    return assignment;
}

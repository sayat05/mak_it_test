// @rev kc-31
import type { Assignment, Branch, Order, Rule } from './types.ts';
import { distanceKm } from './geo.ts';

export function assignBranch(order: Order, branches: Branch[], load: (id: string) => number = () => 0): Assignment {
    const own = branches.filter(b => b.storeId === order.storeId && b.active);
    const result = (branchId: string | null, rule: Rule): Assignment => ({ orderId: order.id, branchId, rule });
    const manual = own.find(b => b.id === order.manualBranchId);
    if (manual) return result(manual.id, 'manual');
    const city = own.filter(b => b.city === order.city);
    const nearest = (pool: Branch[]): Branch | undefined => {
        if (order.lat === null || order.lon === null) return undefined;
        return pool.reduce<Branch | undefined>((best, b) => !best || distance(b) < distance(best) ? b : best, undefined);
    };
    const distance = (b: Branch) => distanceKm(order.lat!, order.lon!, b.lat, b.lon);
    let selected: Branch | undefined;
    let rule: Rule = 'geo';
    if (own.length === 1) { selected = own[0]; rule = 'single'; }
    else if (order.pickupPointId && (selected = own.find(b => b.pickupPointIds.includes(order.pickupPointId!)))) rule = 'pickup_point';
    else if (city.length === 1) { selected = city[0]; rule = 'city'; }
    else selected = nearest(city.length > 1 ? city : own);
    if (selected && load(selected.id) >= selected.dailyLimit) {
        selected = nearest(own.filter(b => load(b.id) < b.dailyLimit));
        rule = 'geo';
    }
    if (!selected) return result(null, 'unassigned');
    if (rule === 'geo' && distance(selected) > 42) return result(null, 'too_far');
    return result(selected.id, rule);
}

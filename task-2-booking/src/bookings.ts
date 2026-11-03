// @rev kc-31
import { randomUUID } from 'node:crypto';
import { masters, services, bookingRepo } from './store.ts';
import { getSlots } from './slots.ts';
import { localDate, localTime, validDate } from './time.ts';
import { now } from './clock.ts';
import type { Master, Service, Booking } from './types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

const locks = new Map<string, Promise<void>>();
async function withMasterLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(id, current);
  await previous;
  try { return await action(); }
  finally { release(); if (locks.get(id) === current) locks.delete(id); }
}

function resolve(masterId: unknown, serviceId: unknown): { master: Master; service: Service } {
  if (typeof masterId !== 'string' || typeof serviceId !== 'string' || !masterId || !serviceId) throw new ApiError(400, 'invalid_request');
  const master = masters.find(m => m.id === masterId);
  const service = services.find(s => s.id === serviceId);
  if (!master || !service) throw new ApiError(404, !master ? 'master_not_found' : 'service_not_found');
  if (!service.masterIds.includes(master.id)) throw new ApiError(400, 'service_not_supported');
  return {master, service};
}

export async function availableSlots(masterId: string, serviceId: string | null, date: string | null) {
  if (!date || !validDate(date)) throw new ApiError(400, 'invalid_date');
  const {master, service} = resolve(masterId, serviceId);
  return {masterId, serviceId, date, slots: getSlots(master, service, date, await bookingRepo.listByMaster(masterId))};
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !/^\+?[\d ()-]+$/.test(value)) throw new ApiError(400, 'invalid_phone');
  const digits = value.replace(/\D/g, '');
  if (!/^[78](?:700|701|702|705|706|707|708|747|771|775|776|777|778)\d{7}$/.test(digits)) throw new ApiError(400, 'invalid_phone');
  return '+7' + digits.slice(1);
}

export async function createBooking(body: unknown): Promise<Booking> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_request');
  const input = body as Record<string, unknown>;
  const {master, service} = resolve(input.masterId, input.serviceId);
  const clientPhone = normalizePhone(input.clientPhone);
  if (typeof input.start !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/.test(input.start) || !validDate(input.start.slice(0, 10))) throw new ApiError(400, 'invalid_start');
  const start = Date.parse(input.start);
  if (!Number.isFinite(start)) throw new ApiError(400, 'invalid_start');
  return withMasterLock(master.id, async () => {
    const date = localDate(start);
    const slots = getSlots(master, service, date, await bookingRepo.listByMaster(master.id));
    if (!slots.some(slot => localTime(date, slot) === start)) throw new ApiError(409, 'slot_unavailable');
    const booking: Booking = {id: randomUUID(), masterId: master.id, serviceId: service.id,
      start: new Date(start).toISOString(), end: new Date(start + service.durationMin * 60000).toISOString(), clientPhone, status: 'active'};
    await bookingRepo.insert(booking);
    return booking;
  });
}

export async function cancelBooking(id: string): Promise<Booking> {
  const found = await bookingRepo.get(id);
  if (!found) throw new ApiError(404, 'booking_not_found');
  return withMasterLock(found.masterId, async () => {
    const booking = (await bookingRepo.get(id))!;
    if (booking.status === 'cancelled') return booking;
    if (Date.parse(booking.start) - now().getTime() < 2 * 3600000) throw new ApiError(409, 'too_late');
    await bookingRepo.update(id, {status: 'cancelled'});
    return {...booking, status: 'cancelled'};
  });
}

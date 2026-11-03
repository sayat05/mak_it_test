// @rev kc-31
import type { Booking, Master, Service } from './types.ts';
import { fromMinutes, toMinutes, weekday, overlaps, localTime } from './time.ts';
import { now } from './clock.ts';

export const SLOT_STEP_MIN = 15;
export const CLEANUP_MIN = 7;

export function getSlots(master: Master, service: Service, date: string, bookings: Booking[]): string[] {
  const day = master.schedule[weekday(date)];
  if (!day || !service.masterIds.includes(master.id)) return [];
  const current = now().getTime();
  const result: string[] = [];
  for (let t = toMinutes(day.from); t + service.durationMin <= toMinutes(day.to); t += SLOT_STEP_MIN) {
    const start = localTime(date, fromMinutes(t));
    const end = start + service.durationMin * 60000;
    if (start <= current) continue;
    if (day.breaks.some(b => overlaps({start, end}, {start: localTime(date, b.from), end: localTime(date, b.to)}))) continue;
    // Include cleanup on both records, so inserting before an existing booking is safe too.
    if (bookings.some(b => b.masterId === master.id && b.status === 'active' && overlaps(
      {start, end: end + CLEANUP_MIN * 60000},
      {start: Date.parse(b.start), end: Date.parse(b.end) + CLEANUP_MIN * 60000},
    ))) continue;
    result.push(fromMinutes(t));
  }
  return result;
}

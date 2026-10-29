/**
 * "Any free master" and group (family) bookings, on top of the per-master availability engine.
 * Pure functions; see combine.test.ts.
 */
import type { DayAvailability, DayStatus, SlotState } from './availability';

export type MasterDay = {
  staffId: string;
  /** Display order in the shop; the tie-breaker when choosing a master. */
  sortOrder: number;
  /** Bookings this master already has that day; fewer = chosen first, to share the work. */
  load: number;
  availability: DayAvailability;
};

export type CombinedSlot = {
  startMin: number;
  startAt: Date;
  state: SlotState;
  /** Masters who can take this start, best choice first. Empty unless `state` is available. */
  candidates: string[];
};

export type CombinedDay = { status: DayStatus; slots: CombinedSlot[] };

const statePriority: Record<SlotState, number> = { available: 0, too_soon: 1, taken: 2 };

/** Ranks masters for a start: least busy first, then shop order, then id (stable). */
export function rankMasters<T extends Pick<MasterDay, 'staffId' | 'sortOrder' | 'load'>>(
  masters: T[],
): T[] {
  return [...masters].sort(
    (a, b) => a.load - b.load || a.sortOrder - b.sortOrder || a.staffId.localeCompare(b.staffId),
  );
}

/**
 * Merges the masters' days into one: a start is available if at least one master is free then.
 * Unavailable starts show the "best" reason among masters (too soon beats taken).
 */
export function combineMasters(masters: MasterDay[]): CombinedDay {
  if (masters.length === 0) return { status: 'closed', slots: [] };

  const byStart = new Map<number, { startAt: Date; state: SlotState; free: MasterDay[] }>();
  for (const master of masters) {
    for (const slot of master.availability.slots) {
      const entry = byStart.get(slot.startMin) ?? {
        startAt: slot.startAt,
        state: slot.state,
        free: [],
      };
      if (statePriority[slot.state] < statePriority[entry.state]) entry.state = slot.state;
      if (slot.state === 'available') entry.free.push(master);
      byStart.set(slot.startMin, entry);
    }
  }

  const slots: CombinedSlot[] = [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([startMin, e]) => ({
      startMin,
      startAt: e.startAt,
      state: e.state,
      candidates: rankMasters(e.free).map((m) => m.staffId),
    }));

  if (slots.some((s) => s.state === 'available')) return { status: 'open', slots };
  // Nobody can take anything: report the day as the masters do (all off → day_off, etc.).
  const statuses = new Set(masters.map((m) => m.availability.status));
  const status: DayStatus =
    statuses.size === 1 ? [...statuses][0]! : slots.length > 0 ? 'full' : 'closed';
  return { status: status === 'open' ? 'full' : status, slots };
}

export type GroupMember = { durationMin: number };

/**
 * A family booked back to back with one master: father 10:00–10:40, son 10:40–11:10, …
 * Returns each member's [start, end). The whole group needs one free block of the summed length.
 */
export function splitGroup(
  startAt: Date,
  members: GroupMember[],
): { startAt: Date; endAt: Date }[] {
  let cursor = startAt.getTime();
  return members.map((m) => {
    const start = cursor;
    cursor += m.durationMin * 60_000;
    return { startAt: new Date(start), endAt: new Date(cursor) };
  });
}

export const groupDuration = (members: GroupMember[]) =>
  members.reduce((sum, m) => sum + m.durationMin, 0);

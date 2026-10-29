import { WorkingHours, TimeSlot, BookingType } from '@/types';

// Uzbekistan (Asia/Tashkent) is a fixed UTC+5 offset with no daylight saving.
// We treat all barber working hours as Tashkent wall-clock time and convert
// to correct UTC instants explicitly, so behaviour is identical no matter
// what timezone the server (e.g. Vercel = UTC) runs in.
const TASHKENT_OFFSET_MIN = 300;
const TASHKENT_OFFSET_MS = TASHKENT_OFFSET_MIN * 60 * 1000;

/** Convert a Tashkent wall-clock time on a given calendar date to a UTC instant. */
function tashkentLocalToInstant(
  year: number,
  month: number, // 1-12
  day: number,
  hours: number,
  minutes: number
): Date {
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - TASHKENT_OFFSET_MS);
}

/** Read the Tashkent wall-clock "HH:MM" label of a UTC instant. */
function instantToTashkentLabel(instantMs: number): string {
  const local = new Date(instantMs + TASHKENT_OFFSET_MS);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function calculateTimeSlots(
  dateStr: string, // YYYY-MM-DD (Tashkent calendar date)
  workingHours: WorkingHours,
  totalDurationMinutes: number,
  existingBookings: BookingType[]
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return slots;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  // Day of week for the Tashkent calendar date (0 = Sun .. 6 = Sat),
  // independent of the server timezone.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  if (!workingHours.workDays?.includes(dayOfWeek)) {
    return slots;
  }

  const [startH, startM] = (workingHours.startTime || '09:00').split(':').map(Number);
  const [endH, endM] = (workingHours.endTime || '20:00').split(':').map(Number);

  const workStart = tashkentLocalToInstant(year, month, day, startH, startM);
  const workEnd = tashkentLocalToInstant(year, month, day, endH, endM);

  // Lunch break
  let breakStart: Date | null = null;
  let breakEnd: Date | null = null;
  if (workingHours.breakStart && workingHours.breakEnd) {
    const [bStartH, bStartM] = workingHours.breakStart.split(':').map(Number);
    const [bEndH, bEndM] = workingHours.breakEnd.split(':').map(Number);
    breakStart = tashkentLocalToInstant(year, month, day, bStartH, bStartM);
    breakEnd = tashkentLocalToInstant(year, month, day, bEndH, bEndM);
  }

  // Only confirmed / pending bookings block a slot.
  const activeBookings = existingBookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'PENDING'
  );

  const now = new Date();
  const stepMs = (workingHours.slotDurationMinutes || 30) * 60 * 1000;
  const durationMs = totalDurationMinutes * 60 * 1000;

  for (let cur = workStart.getTime(); cur < workEnd.getTime(); cur += stepMs) {
    const slotStart = new Date(cur);
    const slotEnd = new Date(cur + durationMs);
    const timeLabel = instantToTashkentLabel(cur);

    let isAvailable = true;
    let unavailableReason: string | undefined = undefined;

    // Slot must finish within working hours.
    if (slotEnd.getTime() > workEnd.getTime()) {
      isAvailable = false;
      unavailableReason = 'After work hours';
    }

    // No booking in the past.
    if (isAvailable && slotStart <= now) {
      isAvailable = false;
      unavailableReason = 'Past time';
    }

    // Lunch break overlap.
    if (isAvailable && breakStart && breakEnd) {
      if (slotStart < breakEnd && slotEnd > breakStart) {
        isAvailable = false;
        unavailableReason = 'Lunch break';
      }
    }

    // Existing booking overlap.
    if (isAvailable) {
      for (const booking of activeBookings) {
        const bStart = new Date(booking.startTime);
        const bEnd = new Date(booking.endTime);
        if (slotStart < bEnd && slotEnd > bStart) {
          isAvailable = false;
          unavailableReason = 'Booked';
          break;
        }
      }
    }

    slots.push({
      time: timeLabel,
      isoString: slotStart.toISOString(),
      available: isAvailable,
      reason: unavailableReason,
    });
  }

  return slots;
}

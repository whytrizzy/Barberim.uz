import { WorkingHours, TimeSlot, BookingType } from '@/types';

export function calculateTimeSlots(
  dateStr: string, // YYYY-MM-DD
  workingHours: WorkingHours,
  totalDurationMinutes: number,
  existingBookings: BookingType[]
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    return [];
  }

  // Day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat
  const dayOfWeek = dateObj.getDay();

  // 1. Check if barber works on this day
  if (!workingHours.workDays.includes(dayOfWeek)) {
    return slots;
  }

  const [startH, startM] = (workingHours.startTime || '09:00').split(':').map(Number);
  const [endH, endM] = (workingHours.endTime || '20:00').split(':').map(Number);

  const workStart = new Date(dateStr);
  workStart.setHours(startH, startM, 0, 0);

  const workEnd = new Date(dateStr);
  workEnd.setHours(endH, endM, 0, 0);

  // Lunch break
  let breakStart: Date | null = null;
  let breakEnd: Date | null = null;
  if (workingHours.breakStart && workingHours.breakEnd) {
    const [bStartH, bStartM] = workingHours.breakStart.split(':').map(Number);
    const [bEndH, bEndM] = workingHours.breakEnd.split(':').map(Number);
    breakStart = new Date(dateStr);
    breakStart.setHours(bStartH, bStartM, 0, 0);
    breakEnd = new Date(dateStr);
    breakEnd.setHours(bEndH, bEndM, 0, 0);
  }

  // Filter out cancelled bookings
  const activeBookings = existingBookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'PENDING'
  );

  const now = new Date();
  const stepMinutes = workingHours.slotDurationMinutes || 30;
  let currentPointer = new Date(workStart);

  while (currentPointer < workEnd) {
    const slotStart = new Date(currentPointer);
    const slotEnd = new Date(slotStart.getTime() + totalDurationMinutes * 60 * 1000);

    const hours = slotStart.getHours().toString().padStart(2, '0');
    const minutes = slotStart.getMinutes().toString().padStart(2, '0');
    const timeLabel = `${hours}:${minutes}`;

    let isAvailable = true;
    let unavailableReason: string | undefined = undefined;

    // Check if slot extends beyond working hours
    if (slotEnd > workEnd) {
      isAvailable = false;
      unavailableReason = 'After work hours';
    }

    // Check past time
    if (isAvailable && slotStart <= now) {
      isAvailable = false;
      unavailableReason = 'Past time';
    }

    // Check lunch break overlap
    if (isAvailable && breakStart && breakEnd) {
      if (slotStart < breakEnd && slotEnd > breakStart) {
        isAvailable = false;
        unavailableReason = 'Lunch break';
      }
    }

    // Check existing booking overlap
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

    // Advance by step
    currentPointer = new Date(currentPointer.getTime() + stepMinutes * 60 * 1000);
  }

  return slots;
}

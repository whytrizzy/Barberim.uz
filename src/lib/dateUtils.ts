const TASHKENT_OFFSET_MIN = 300; // UTC+5
const TASHKENT_OFFSET_MS = TASHKENT_OFFSET_MIN * 60 * 1000;

/**
 * Converts a UTC ISO date string or Date object into a Date object adjusted for Tashkent (UTC+5) wall-clock time.
 */
export function getTashkentDate(isoOrDate: string | Date): Date {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Date(d.getTime() + TASHKENT_OFFSET_MS);
}

/**
 * Formats an ISO date string or Date into Tashkent wall-clock time "HH:mm".
 */
export function formatTashkentTime(isoOrDate: string | Date): string {
  const local = getTashkentDate(isoOrDate);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Formats an ISO date string or Date into Tashkent calendar date "DD-MMM" or "DD-MMM-YYYY".
 */
export function formatTashkentDate(isoOrDate: string | Date, includeYear = false): string {
  const local = getTashkentDate(isoOrDate);
  const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
  const day = local.getUTCDate();
  const monthName = months[local.getUTCMonth()];
  if (includeYear) {
    return `${day}-${monthName}, ${local.getUTCFullYear()}`;
  }
  return `${day}-${monthName}`;
}

/**
 * Formats an ISO date string or Date into "DD-MMM @ HH:mm" in Tashkent time.
 */
export function formatTashkentDateTime(isoOrDate: string | Date): { dateStr: string; timeStr: string } {
  return {
    dateStr: formatTashkentDate(isoOrDate),
    timeStr: formatTashkentTime(isoOrDate),
  };
}

const DAYS_UZ = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Shan'];
const MONTHS_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** Date option for pickers: today + offsetDays by the Tashkent calendar. */
export function tashkentDateOption(offsetDays: number): {
  isoDate: string; // YYYY-MM-DD
  dayName: string;
  dayNum: number;
  monthName: string;
} {
  const t = getTashkentDate(new Date());
  t.setUTCDate(t.getUTCDate() + offsetDays);
  const isoDate = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(
    t.getUTCDate()
  ).padStart(2, '0')}`;
  return {
    isoDate,
    dayName: DAYS_UZ[t.getUTCDay()],
    dayNum: t.getUTCDate(),
    monthName: MONTHS_UZ[t.getUTCMonth()],
  };
}

/** "110 000" — UZS money formatting with thin spaces. */
export function formatUZS(v: number): string {
  return new Intl.NumberFormat('ru-RU').format(v);
}

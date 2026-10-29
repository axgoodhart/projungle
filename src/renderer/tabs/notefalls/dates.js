/* ── Date / time helpers for the notefalls feed + date rail ──────────── */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "3 hrs. ago", "2 days ago", "1 week ago", "2 weeks ago", "1 month ago", "Just now" */
export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) {
    const n = Math.round(diff / MINUTE);
    return `${n} min${n === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const n = Math.round(diff / HOUR);
    return `${n} hr${n === 1 ? '' : 's'}. ago`;
  }
  if (diff < 7 * DAY) {
    const n = Math.round(diff / DAY);
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  if (diff < 30 * DAY) {
    const n = Math.round(diff / (7 * DAY));
    return `${n} week${n === 1 ? '' : 's'} ago`;
  }
  if (diff < 365 * DAY) {
    const n = Math.round(diff / (30 * DAY));
    return `${n} month${n === 1 ? '' : 's'} ago`;
  }
  const n = Math.round(diff / (365 * DAY));
  return `${n} year${n === 1 ? '' : 's'} ago`;
}

/** Local YYYY-MM-DD key for grouping/comparison. */
export function dayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "MONDAY JUNE 11 2026" */
export function formatSessionDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${WEEKDAY_NAMES[d.getDay()].toUpperCase()}  ${MONTH_NAMES[d.getMonth()].toUpperCase()}  ${d.getDate()}  ${d.getFullYear()}`;
}

function formatClock(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return { h, m, ampm };
}

/** "2:34 – 3:20 PM" (drops the leading AM/PM when both sides match) */
export function formatTimeRange(startTs, endTs) {
  if (!startTs || !endTs) return '';
  const a = formatClock(startTs);
  const b = formatClock(endTs);
  const left = a.ampm === b.ampm ? `${a.h}:${a.m}` : `${a.h}:${a.m} ${a.ampm}`;
  return `${left} – ${b.h}:${b.m} ${b.ampm}`;
}

export { WEEKDAY_LETTERS, MONTH_NAMES, MONTH_SHORT, DAY };

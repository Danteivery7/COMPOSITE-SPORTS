const EASTERN_TIME_ZONE = 'America/New_York';

function getFormatter(options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    ...options,
  });
}

export function getEasternTimeZone() {
  return EASTERN_TIME_ZONE;
}

export function getEasternParts(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = getFormatter({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function getEasternDateKey(input = new Date()) {
  const parts = getEasternParts(input);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getEasternDateStamp(input = new Date()) {
  return getEasternDateKey(input).replaceAll('-', '');
}

export function isSameEasternDate(left, right = new Date()) {
  return getEasternDateKey(left) === getEasternDateKey(right);
}

export function isWithinLastHours(input, hours = 24, now = new Date()) {
  if (!input) return false;
  const then = new Date(input).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(current)) return false;
  return current - then >= 0 && current - then <= hours * 60 * 60 * 1000;
}

export function formatEasternDisplay(input, options = {}) {
  if (!input) return '';
  return getFormatter({
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(new Date(input));
}

export function getEasternNowLabel() {
  return getFormatter({
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

export function compareByStartTime(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return leftTime - rightTime;
}

export function getEasternWeeklyCycleId(input = new Date()) {
  const parts = getEasternParts(input);
  const pseudoNow = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  let cycleStart = Date.UTC(parts.year, parts.month - 1, parts.day - mondayOffset, 6, 0, 0);

  if (pseudoNow < cycleStart) {
    cycleStart -= 7 * 24 * 60 * 60 * 1000;
  }

  const anchor = Date.UTC(2026, 0, 5, 6, 0, 0);
  return Math.floor((cycleStart - anchor) / (7 * 24 * 60 * 60 * 1000));
}

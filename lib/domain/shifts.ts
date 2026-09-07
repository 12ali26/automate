/**
 * Shift-boundary / overdue logic. Pure — no DB, no `next/*`, no date library.
 *
 * A checkout is "overdue" once the first shift boundary AFTER it was opened has
 * passed, plus a grace period, and it is still open. Boundaries are local
 * wall-clock times in the org's IANA timezone (never UTC — otherwise DST would
 * silently shift every deadline twice a year).
 *
 * No boundaries configured → nothing is ever overdue. That is the right default
 * for a fresh org: silence, not false alarms.
 */

export interface ShiftSettings {
  /** "HH:MM" local times, e.g. ["06:00", "14:00", "22:00"]. Sorted, validated. */
  shiftBoundaries: string[]
  graceMinutes: number
  /** IANA timezone, e.g. "Asia/Qatar". Falls back to "UTC". */
  timezone: string
}

const DEFAULT_GRACE_MINUTES = 30

function parseHHMM(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Read shift config out of `orgs.settings`, coercing and defaulting safely. */
export function parseShiftSettings(
  settings: Record<string, unknown> | null | undefined,
): ShiftSettings {
  const raw = settings ?? {}

  const boundariesRaw = Array.isArray(raw.shift_boundaries) ? raw.shift_boundaries : []
  const shiftBoundaries = boundariesRaw
    .filter((x): x is string => typeof x === 'string' && parseHHMM(x) !== null)
    .sort() //  zero-padded "HH:MM" sorts lexically == chronologically

  const graceRaw = raw.grace_minutes
  const graceMinutes =
    typeof graceRaw === 'number' && Number.isFinite(graceRaw) && graceRaw >= 0 && graceRaw <= 1440
      ? graceRaw
      : DEFAULT_GRACE_MINUTES

  const tzRaw = raw.timezone
  const timezone =
    typeof tzRaw === 'string' && tzRaw.length > 0 && isValidTimeZone(tzRaw) ? tzRaw : 'UTC'

  return { shiftBoundaries, graceMinutes, timezone }
}

/** Wall-clock parts of an instant, as seen in `timeZone`. */
function partsInZone(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const { type, value } of dtf.formatToParts(instant)) p[type] = value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

/**
 * The UTC instant for a given wall-clock time in `timeZone`. Corrects an
 * initial "treat wall time as UTC" guess by the observed offset, iterating
 * twice so a DST transition on the boundary day still resolves.
 */
function zonedWallToInstant(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const target = Date.UTC(year, month1 - 1, day, hour, minute, 0)
  let guess = target
  for (let i = 0; i < 2; i += 1) {
    const p = partsInZone(new Date(guess), timeZone)
    const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const offset = wallAsUtc - guess
    const next = target - offset
    if (next === guess) break
    guess = next
  }
  return new Date(guess)
}

/**
 * The first shift boundary strictly after `timestamp`, as an instant. Rolls
 * forward across midnight — 23:00 with boundaries 06/14/22 → 06:00 next day.
 * Null when no boundaries are configured.
 */
export function nextBoundaryAfter(
  timestamp: Date,
  boundaries: string[],
  timezone: string,
): Date | null {
  const minutes = boundaries
    .map(parseHHMM)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)
  if (minutes.length === 0) return null

  const local = partsInZone(timestamp, timezone)
  // 0..2 days is always enough once there is at least one boundary.
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    for (const m of minutes) {
      const cand = zonedWallToInstant(
        local.year,
        local.month,
        local.day + dayOffset,
        Math.floor(m / 60),
        m % 60,
        timezone,
      )
      if (cand.getTime() > timestamp.getTime()) return cand
    }
  }
  return null
}

/** The moment a checkout opened at `openedAt` becomes overdue (boundary + grace),
 * or null when no boundaries are configured. */
export function overdueDeadline(openedAt: Date, settings: ShiftSettings): Date | null {
  const boundary = nextBoundaryAfter(openedAt, settings.shiftBoundaries, settings.timezone)
  if (!boundary) return null
  return new Date(boundary.getTime() + settings.graceMinutes * 60_000)
}

/** Whether an open checkout is overdue as of `now`. Closed checkouts never are. */
export function isOverdue(
  checkout: { openedAt: Date | string; closedAt?: Date | string | null },
  settings: ShiftSettings,
  now: Date,
): boolean {
  if (checkout.closedAt) return false
  const opened =
    checkout.openedAt instanceof Date ? checkout.openedAt : new Date(checkout.openedAt)
  const deadline = overdueDeadline(opened, settings)
  if (!deadline) return false
  return now.getTime() >= deadline.getTime()
}

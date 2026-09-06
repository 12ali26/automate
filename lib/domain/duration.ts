/**
 * Human-readable elapsed time. Pure, no date library.
 *
 *   under ~45s  -> "just now"
 *   under 1h    -> "5m"
 *   under 1d    -> "2h 15m"   (minutes dropped when zero: "3h")
 *   1d or more  -> "3d 4h"    (hours dropped when zero: "2d")
 */
export function formatDuration(
  from: Date | string | number,
  now: Date | number = Date.now(),
): string {
  const start =
    from instanceof Date ? from.getTime() : typeof from === 'string' ? Date.parse(from) : from
  const end = now instanceof Date ? now.getTime() : now

  const seconds = Math.floor((end - start) / 1000)
  if (!Number.isFinite(seconds) || seconds < 45) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remMinutes = minutes % 60
    return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`
  }

  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`
}

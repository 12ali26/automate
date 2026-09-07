/**
 * The identifier that appears in a machine's URL (/{org}/m/{slug}).
 *
 * It is deliberately NOT the human-facing `code` (VAC-001, FM-SD-003): codes
 * are guessable and can collide across tenants. The slug is random and
 * unguessable, so the only way to a machine's actions is to scan its sticker.
 *
 * The whole scheme is this one function body — change it here and nowhere else.
 */

import { randomBytes } from 'node:crypto'

// Lowercase alphanumeric with the visually ambiguous characters removed
// (no 0/o, no 1/l/i) so a supervisor can read a slug off a screen if a sticker
// is damaged. 31 symbols.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const SLUG_LENGTH = 10

// Largest multiple of ALPHABET.length that fits in a byte — bytes at or above
// this are rejected so every symbol is equally likely (no modulo bias).
const REJECT_AT = 256 - (256 % ALPHABET.length)

export function generateMachineSlug(): string {
  let slug = ''
  while (slug.length < SLUG_LENGTH) {
    for (const byte of randomBytes(SLUG_LENGTH * 2)) {
      if (byte >= REJECT_AT) continue
      slug += ALPHABET[byte % ALPHABET.length]
      if (slug.length === SLUG_LENGTH) break
    }
  }
  return slug
}

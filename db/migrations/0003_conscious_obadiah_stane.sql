-- machines.slug: the random, unguessable identifier that replaces the human
-- `code` in the URL. Added nullable, backfilled for existing rows, then made
-- NOT NULL and unique per org. Hand-edited from the drizzle-kit output to add
-- the backfill (a plain `ADD COLUMN ... NOT NULL` would fail on existing rows).

ALTER TABLE "machines" ADD COLUMN "slug" text;--> statement-breakpoint

-- Backfill: 10 chars from the same ambiguity-free alphabet the app uses
-- (no 0/o/1/l/i). gen_random_uuid() is volatile, so this is evaluated per row.
UPDATE "machines"
SET "slug" = substr(
  translate(
    replace(gen_random_uuid()::text, '-', ''),
    '0123456789abcdef',
    'wxyz23456789abhj'
  ),
  1, 10
)
WHERE "slug" IS NULL;--> statement-breakpoint

ALTER TABLE "machines" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_org_id_slug_unique" UNIQUE("org_id","slug");

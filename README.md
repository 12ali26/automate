# automate

Multi-tenant SaaS for tracking shared physical machines (vacuums, floor
polishers, …) in facilities management.

**Stage 0 — foundation only.** This repo currently contains the app skeleton,
the database client, one table (`orgs`), and a single page that proves the
database connection. No auth, no tenant features, no additional tables yet.

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS
- Drizzle ORM + drizzle-kit
- Postgres (Supabase-hosted), reached only via a connection string — the
  browser never talks to the database
- Zod for validation
- pnpm

## Project layout

```
app/                 App Router entry; app/page.tsx proves the DB connection
app/[org]/           Tenant-scoped routes (empty)
app/[org]/manage/    Manager routes (empty)
lib/db.ts            The single Drizzle client — the ONLY file that imports the postgres driver
lib/repos/           All data access lives here; components import from here, never from lib/db.ts
lib/auth/            Session + org context (empty — Stage 1)
lib/domain/          Pure business rules, no DB or framework imports (empty)
lib/validation/      Zod schemas shared by client and server (empty)
db/schema.ts         Drizzle schema
db/migrations/       Generated SQL migrations — forward-only, never edit a shipped file
db/seed.ts           Idempotent seed script
```

### Architectural rules (whole project)

- Components never import `lib/db.ts`. All data access goes through
  `lib/repos/*` so an offline-capable client can be built later without
  rewriting screens.
- `lib/domain/` holds pure functions only — no DB, no framework imports.
- Migrations are forward-only. Never edit a migration that has shipped.
- No secrets in the repo.

## Setup

Requires Node 20+ and pnpm 10+.

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure the database connection**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `DATABASE_URL` to your Supabase Postgres connection
   string (Supabase dashboard → Project Settings → Database → Connection
   string → URI). Use the direct connection (port 5432) for migrations and
   seeding. `.env` is gitignored.

3. **Apply the migration**

   ```bash
   pnpm db:migrate
   ```

   This creates the `orgs` table. The migration file already exists in
   `db/migrations/`; you do not need to generate it.

4. **Seed**

   ```bash
   pnpm db:seed
   ```

   Inserts one org (`demo` / "Demo Facilities"). Safe to run repeatedly.

5. **Run**

   ```bash
   pnpm dev
   ```

   Open http://localhost:3000 — it should render `1 orgs`, read live from the
   database.

## Scripts

| Script            | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `pnpm dev`        | Start the dev server                                |
| `pnpm build`      | Production build                                    |
| `pnpm db:generate`| Generate a new migration from `db/schema.ts`        |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL`          |
| `pnpm db:seed`    | Run the idempotent seed script                      |

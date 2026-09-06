-- Stage 1B: row-level security + triggers. Hand-written; drizzle-kit does not
-- generate RLS, policies, roles, or triggers.

-- ---------------------------------------------------------------------------
-- Non-bypass application role
--
-- Supabase's default "postgres" role (used by the connection string) has the
-- BYPASSRLS attribute, so RLS — even FORCE'd RLS — never applies to it. The
-- policies below are therefore inert for a raw "postgres" connection.
--
-- This role exists so tenant isolation can actually bite: it has no LOGIN and
-- no BYPASSRLS. "postgres" is a member of it, so server-side code can drop to
-- it with SET LOCAL ROLE app_authenticated before running tenant queries.
-- Wiring the application connection to assume this role is Stage 1C.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_authenticated') THEN
    CREATE ROLE app_authenticated NOLOGIN NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
GRANT app_authenticated TO postgres;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_authenticated;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Part 1 — row-level security
--
-- One uniform policy per table. When app.current_org is unset the expression
-- is NULL, and org_id = NULL is never true, so a query with no org context
-- returns zero rows instead of leaking another tenant's data. FORCE makes the
-- policy apply to the table owner too.
--
-- nullif(..., '') is required on Supabase: the supautils extension
-- pre-registers the app.* GUC namespace, so current_setting('app.current_org',
-- true) yields '' (not NULL) when unset, and ''::uuid would raise instead of
-- filtering. nullif maps that '' back to NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "locations";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "locations"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "employees";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "employees"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "checklist_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "checklist_templates";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "checklist_templates"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "checklist_items";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "checklist_items"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "machines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "machines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "machines";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "machines"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "checkouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checkouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "checkouts";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "checkouts"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "checklist_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_responses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "checklist_responses";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "checklist_responses"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "incidents";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "incidents"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "discrepancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discrepancies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "discrepancies";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "discrepancies"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_isolation" ON "activity_log";--> statement-breakpoint
CREATE POLICY "org_isolation" ON "activity_log"
  FOR ALL
  USING (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Part 2 — activity_log is append-only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION block_log_mutation() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only';
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS no_log_mutation ON activity_log;--> statement-breakpoint
CREATE TRIGGER no_log_mutation
  BEFORE UPDATE OR DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION block_log_mutation();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Part 3 — machines.status stays in sync with checkouts
--
-- SECURITY DEFINER + SET search_path = public so the function's UPDATE on
-- machines runs as the function owner ("postgres") and is not itself filtered
-- by the caller's RLS context.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_machine_status() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE machines SET status = 'checked_out'
      WHERE id = NEW.machine_id;
  ELSIF (TG_OP = 'UPDATE'
         AND OLD.closed_at IS NULL
         AND NEW.closed_at IS NOT NULL) THEN
    UPDATE machines SET status = 'available'
      WHERE id = NEW.machine_id AND status = 'checked_out';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS checkout_status_sync ON checkouts;--> statement-breakpoint
CREATE TRIGGER checkout_status_sync
  AFTER INSERT OR UPDATE ON checkouts
  FOR EACH ROW EXECUTE FUNCTION sync_machine_status();

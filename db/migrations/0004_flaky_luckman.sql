-- Stage 7A: link a manager's employee row to their Supabase Auth user.
-- Nullable — set only for managers as they're created; staff never have one.
-- UNIQUE allows many NULLs, so this does not constrain staff.
ALTER TABLE "employees" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_auth_user_id_unique" UNIQUE("auth_user_id");

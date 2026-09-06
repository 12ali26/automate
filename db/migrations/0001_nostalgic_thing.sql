CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"machine_id" uuid,
	"employee_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"blocking" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"checkout_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_responses_checkout_id_item_id_unique" UNIQUE("checkout_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"return_location_id" uuid,
	CONSTRAINT "checkouts_closed_at_after_opened_at_check" CHECK ("checkouts"."closed_at" is null or "checkouts"."closed_at" >= "checkouts"."opened_at")
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"last_checkout_id" uuid,
	"expected_location_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discrepancies_status_check" CHECK ("discrepancies"."status" in ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"fm_id" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_org_id_fm_id_unique" UNIQUE("org_id","fm_id"),
	CONSTRAINT "employees_role_check" CHECK ("employees"."role" in ('staff', 'manager'))
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"checkout_id" uuid,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"cleared_by" uuid,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_status_check" CHECK ("incidents"."status" in ('open', 'cleared'))
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_org_id_name_unique" UNIQUE("org_id","name"),
	CONSTRAINT "locations_type_check" CHECK ("locations"."type" in ('store', 'housekeeping'))
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"template_id" uuid,
	"current_location_id" uuid,
	"status" text DEFAULT 'available' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machines_org_id_code_unique" UNIQUE("org_id","code"),
	CONSTRAINT "machines_status_check" CHECK ("machines"."status" in ('available', 'checked_out', 'faulty'))
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_item_id_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_return_location_id_locations_id_fk" FOREIGN KEY ("return_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_reported_by_employees_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_last_checkout_id_checkouts_id_fk" FOREIGN KEY ("last_checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_expected_location_id_locations_id_fk" FOREIGN KEY ("expected_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_resolved_by_employees_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_cleared_by_employees_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_current_location_id_locations_id_fk" FOREIGN KEY ("current_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_org_id_created_at_idx" ON "activity_log" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_machine_id_created_at_idx" ON "activity_log" USING btree ("machine_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "checklist_items_template_id_sort_order_idx" ON "checklist_items" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_checkout_per_machine" ON "checkouts" USING btree ("machine_id") WHERE "checkouts"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "checkouts_org_id_opened_at_idx" ON "checkouts" USING btree ("org_id","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "discrepancies_org_id_status_created_at_idx" ON "discrepancies" USING btree ("org_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "employees_org_id_active_idx" ON "employees" USING btree ("org_id") WHERE "employees"."active";--> statement-breakpoint
CREATE INDEX "incidents_org_id_status_created_at_idx" ON "incidents" USING btree ("org_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "machines_org_id_status_idx" ON "machines" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "machines_org_id_current_location_id_idx" ON "machines" USING btree ("org_id","current_location_id");
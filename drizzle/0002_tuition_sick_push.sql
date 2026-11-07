CREATE TYPE "public"."sick_leave_status" AS ENUM('open', 'submitted', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'payment';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'health';--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "sick_leave_files" (
	"id" text PRIMARY KEY NOT NULL,
	"sick_leave_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sick_leaves" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"comment" text,
	"status" "sick_leave_status" DEFAULT 'open' NOT NULL,
	"reviewer_id" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuition_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"contract_no" text NOT NULL,
	"period" text NOT NULL,
	"amount" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"receipt_no" text,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disciplines" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "faculties" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sick_leave_files" ADD CONSTRAINT "sick_leave_files_sick_leave_id_sick_leaves_id_fk" FOREIGN KEY ("sick_leave_id") REFERENCES "public"."sick_leaves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sick_leaves" ADD CONSTRAINT "sick_leaves_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sick_leaves" ADD CONSTRAINT "sick_leaves_reviewer_id_staff_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sick_leave_files_leave_idx" ON "sick_leave_files" USING btree ("sick_leave_id");--> statement-breakpoint
CREATE INDEX "sick_leaves_student_idx" ON "sick_leaves" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "sick_leaves_status_idx" ON "sick_leaves" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tuition_student_idx" ON "tuition_payments" USING btree ("student_id","due_at");--> statement-breakpoint
CREATE INDEX "tuition_due_idx" ON "tuition_payments" USING btree ("due_at");
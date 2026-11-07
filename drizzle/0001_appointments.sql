CREATE TYPE "public"."appointment_status" AS ENUM('booked', 'done', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"faculty_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" smallint DEFAULT 15 NOT NULL,
	"topic" text NOT NULL,
	"comment" text,
	"status" "appointment_status" DEFAULT 'booked' NOT NULL,
	"code" text NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_slot_booked_idx" ON "appointments" USING btree ("faculty_id","starts_at") WHERE status = 'booked';--> statement-breakpoint
CREATE INDEX "appointments_student_idx" ON "appointments" USING btree ("student_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_faculty_time_idx" ON "appointments" USING btree ("faculty_id","starts_at");
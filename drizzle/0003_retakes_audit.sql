CREATE TYPE "public"."retake_status" AS ENUM('issued', 'passed', 'failed', 'absent');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_role" "role",
	"actor_name" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"student_id" text,
	"faculty_id" text,
	"summary" text NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retake_referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"retake_session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"final_grade_id" text,
	"number" text NOT NULL,
	"status" "retake_status" DEFAULT 'issued' NOT NULL,
	"result_mark" text,
	"result_points" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retake_referrals_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "retake_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"attempt" smallint DEFAULT 2 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"room" text NOT NULL,
	"commission" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_by_staff_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retake_referrals" ADD CONSTRAINT "retake_referrals_retake_session_id_retake_sessions_id_fk" FOREIGN KEY ("retake_session_id") REFERENCES "public"."retake_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_referrals" ADD CONSTRAINT "retake_referrals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_referrals" ADD CONSTRAINT "retake_referrals_final_grade_id_final_grades_id_fk" FOREIGN KEY ("final_grade_id") REFERENCES "public"."final_grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_sessions" ADD CONSTRAINT "retake_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_sessions" ADD CONSTRAINT "retake_sessions_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_student_idx" ON "audit_log" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_faculty_idx" ON "audit_log" USING btree ("faculty_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "retake_referrals_session_student_idx" ON "retake_referrals" USING btree ("retake_session_id","student_id");--> statement-breakpoint
CREATE INDEX "retake_referrals_student_idx" ON "retake_referrals" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "retake_sessions_course_idx" ON "retake_sessions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "retake_sessions_time_idx" ON "retake_sessions" USING btree ("starts_at");
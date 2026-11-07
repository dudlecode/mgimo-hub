CREATE TYPE "public"."actor" AS ENUM('student', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."campus" AS ENUM('vernadsky', 'odintsovo');--> statement-breakpoint
CREATE TYPE "public"."control_type" AS ENUM('exam', 'credit', 'diff_credit');--> statement-breakpoint
CREATE TYPE "public"."delivery" AS ENUM('electronic', 'paper');--> statement-breakpoint
CREATE TYPE "public"."lesson_format" AS ENUM('lecture', 'seminar', 'practice', 'lang');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('scheduled', 'cancelled', 'moved', 'room_changed', 'teacher_changed');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('schedule', 'request', 'grade', 'deadline', 'news', 'system');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('submitted', 'in_review', 'needs_info', 'in_progress', 'ready', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'staff');--> statement-breakpoint
CREATE SEQUENCE "public"."request_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"faculty_id" text,
	"course" smallint,
	"group_id" text,
	"author_name" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"max_points" smallint NOT NULL,
	"due_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"discipline_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"group_id" text,
	"semester" smallint NOT NULL,
	"control_type" "control_type" NOT NULL,
	"credits" smallint NOT NULL,
	"is_language" boolean DEFAULT false NOT NULL,
	"lang_group" text,
	"exam_at" timestamp with time zone,
	"exam_room" text,
	"consultation_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deadline_done" (
	"student_id" text NOT NULL,
	"item_id" text NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_done_student_id_item_id_pk" PRIMARY KEY("student_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"faculty_id" text,
	"course" smallint,
	"group_id" text,
	"funding" text,
	"link" text
);
--> statement-breakpoint
CREATE TABLE "disciplines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	CONSTRAINT "enrollments_student_id_course_id_pk" PRIMARY KEY("student_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "faculties" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"campus" "campus" DEFAULT 'vernadsky' NOT NULL,
	"office_room" text NOT NULL,
	"office_hours" text NOT NULL,
	"office_phone" text NOT NULL,
	"office_email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "final_grades" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"points" smallint NOT NULL,
	"mark" text NOT NULL,
	"graded_at" timestamp with time zone NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"retake_at" timestamp with time zone,
	"retake_room" text
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"faculty_id" text NOT NULL,
	"program_code" text NOT NULL,
	"program_name" text NOT NULL,
	"profile_name" text,
	"course" smallint NOT NULL,
	"campus" "campus" DEFAULT 'vernadsky' NOT NULL,
	CONSTRAINT "groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"pair_no" smallint NOT NULL,
	"room" text NOT NULL,
	"building" text NOT NULL,
	"format" "lesson_format" NOT NULL,
	"status" "lesson_status" DEFAULT 'scheduled' NOT NULL,
	"change_note" text,
	"prev_starts_at" timestamp with time zone,
	"prev_room" text,
	"prev_teacher" text,
	"substitute_teacher" text,
	"changed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"ip" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"important" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"status" "request_status",
	"message" text,
	"actor" "actor" NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"student_id" text NOT NULL,
	"type" text NOT NULL,
	"status" "request_status" DEFAULT 'submitted' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery" "delivery" DEFAULT 'electronic' NOT NULL,
	"copies" smallint DEFAULT 1 NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"verify_code" text,
	"document_no" text,
	"assigned_staff_id" text,
	CONSTRAINT "requests_number_unique" UNIQUE("number"),
	CONSTRAINT "requests_verify_code_unique" UNIQUE("verify_code")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"student_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"points" real NOT NULL,
	"graded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scores_student_id_assessment_id_pk" PRIMARY KEY("student_id","assessment_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"position" text NOT NULL,
	"faculty_id" text,
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"birth_date" date NOT NULL,
	"record_book" text NOT NULL,
	"student_card" text NOT NULL,
	"group_id" text NOT NULL,
	"study_form" text DEFAULT 'очная' NOT NULL,
	"funding" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrollment_year" smallint NOT NULL,
	"avatar_hue" smallint DEFAULT 220 NOT NULL,
	"activity_bonus" real DEFAULT 0 NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "students_record_book_unique" UNIQUE("record_book"),
	CONSTRAINT "students_student_card_unique" UNIQUE("student_card")
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" text PRIMARY KEY NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"position" text NOT NULL,
	"department" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_done" ADD CONSTRAINT "deadline_done_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_grades" ADD CONSTRAINT "final_grades_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_grades" ADD CONSTRAINT "final_grades_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_published_idx" ON "announcements" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "assessments_course_idx" ON "assessments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "assistant_usage_user_idx" ON "assistant_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "courses_group_idx" ON "courses" USING btree ("group_id","semester");--> statement-breakpoint
CREATE INDEX "enrollments_course_idx" ON "enrollments" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "final_grades_student_course_idx" ON "final_grades" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "lessons_course_time_idx" ON "lessons" USING btree ("course_id","starts_at");--> statement-breakpoint
CREATE INDEX "lessons_time_idx" ON "lessons" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "login_attempts_login_idx" ON "login_attempts" USING btree ("login","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "request_events_request_idx" ON "request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "requests_student_idx" ON "requests" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "students_group_idx" ON "students" USING btree ("group_id");
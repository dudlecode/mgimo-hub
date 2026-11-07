import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
/** Двоичные данные (сканы справок). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
const uuidPk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ───────────────────────── Перечисления ─────────────────────────

export const roleEnum = pgEnum("role", ["student", "staff"]);
export const campusEnum = pgEnum("campus", ["vernadsky", "odintsovo"]);
export const controlTypeEnum = pgEnum("control_type", ["exam", "credit", "diff_credit"]);
export const lessonFormatEnum = pgEnum("lesson_format", ["lecture", "seminar", "practice", "lang"]);
export const lessonStatusEnum = pgEnum("lesson_status", [
  "scheduled",
  "cancelled",
  "moved",
  "room_changed",
  "teacher_changed",
]);
export const requestStatusEnum = pgEnum("request_status", [
  "submitted",
  "in_review",
  "needs_info",
  "in_progress",
  "ready",
  "completed",
  "rejected",
  "cancelled",
]);
export const deliveryEnum = pgEnum("delivery", ["electronic", "paper"]);
export const actorEnum = pgEnum("actor", ["student", "staff", "system"]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "schedule",
  "request",
  "grade",
  "deadline",
  "news",
  "system",
  "payment",
  "health",
]);

/** open: студент болеет; submitted: выздоровел и приложил справку; approved / rejected: решение учебного офиса */
export const sickLeaveStatusEnum = pgEnum("sick_leave_status", ["open", "submitted", "approved", "rejected"]);

/** issued: направление выдано; passed / failed / absent: итог пересдачи */
export const retakeStatusEnum = pgEnum("retake_status", ["issued", "passed", "failed", "absent"]);

export const appointmentStatusEnum = pgEnum("appointment_status", ["booked", "done", "no_show", "cancelled"]);

export const requestNumberSeq = pgSequence("request_number_seq", { startWith: 1000, increment: 1 });

// ───────────────────────── Аутентификация ─────────────────────────

export const users = pgTable("users", {
  id: uuidPk(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
});

/** id = SHA-256 от токена из cookie. Сам токен в БД не хранится. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    login: text("login").notNull(),
    ip: text("ip").notNull(),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_login_idx").on(t.login, t.createdAt),
    index("login_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);

// ───────────────────────── Оргструктура ─────────────────────────

export const faculties = pgTable("faculties", {
  id: text("id").primaryKey(), // "mo", "meo", …
  code: text("code").notNull(), // "МО"
  name: text("name").notNull(),
  campus: campusEnum("campus").notNull().default("vernadsky"),
  officeRoom: text("office_room").notNull(),
  officeHours: text("office_hours").notNull(),
  officePhone: text("office_phone").notNull(),
  officeEmail: text("office_email").notNull(),
  /** название для английского интерфейса */
  nameEn: text("name_en"),
});

export const groups = pgTable("groups", {
  id: uuidPk(),
  code: text("code").notNull().unique(),
  facultyId: text("faculty_id")
    .notNull()
    .references(() => faculties.id),
  programCode: text("program_code").notNull(), // 41.03.05
  programName: text("program_name").notNull(), // Международные отношения
  profileName: text("profile_name"), // null = профиль ещё не выбран
  course: smallint("course").notNull(),
  campus: campusEnum("campus").notNull().default("vernadsky"),
});

export type StudentLanguage = { name: string; level: string; order: number; group: string };

export const students = pgTable(
  "students",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    lastName: text("last_name").notNull(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    recordBook: text("record_book").notNull().unique(),
    studentCard: text("student_card").notNull().unique(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    studyForm: text("study_form").notNull().default("очная"),
    funding: text("funding").notNull(), // budget | contract
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    languages: jsonb("languages").$type<StudentLanguage[]>().notNull().default(sql`'[]'::jsonb`),
    enrollmentYear: smallint("enrollment_year").notNull(),
    avatarHue: smallint("avatar_hue").notNull().default(220),
    activityBonus: real("activity_bonus").notNull().default(0), // 0..5 % к рейтингу
  },
  (t) => [index("students_group_idx").on(t.groupId)],
);

export const staff = pgTable("staff", {
  id: uuidPk(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  position: text("position").notNull(),
  /** null, единый студенческий офис, видит все факультеты */
  facultyId: text("faculty_id").references(() => faculties.id),
});

// ───────────────────────── Учёба ─────────────────────────

export const teachers = pgTable("teachers", {
  id: uuidPk(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  position: text("position").notNull(),
  department: text("department").notNull(),
});

export const disciplines = pgTable("disciplines", {
  id: uuidPk(),
  name: text("name").notNull(),
  /** название для английского интерфейса */
  nameEn: text("name_en"),
  department: text("department").notNull(),
});

/** Дисциплина, которую ведут конкретной группе (или языковой подгруппе) в конкретном семестре. */
export const courses = pgTable(
  "courses",
  {
    id: uuidPk(),
    disciplineId: text("discipline_id")
      .notNull()
      .references(() => disciplines.id),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id),
    groupId: text("group_id").references(() => groups.id),
    semester: smallint("semester").notNull(),
    controlType: controlTypeEnum("control_type").notNull(),
    credits: smallint("credits").notNull(),
    isLanguage: boolean("is_language").notNull().default(false),
    langGroup: text("lang_group"),
    examAt: ts("exam_at"),
    examRoom: text("exam_room"),
    consultationAt: ts("consultation_at"),
  },
  (t) => [index("courses_group_idx").on(t.groupId, t.semester)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.courseId] }), index("enrollments_course_idx").on(t.courseId)],
);

/** Контрольная точка текущего семестра (контрольная, эссе, работа на семинарах…). */
export const assessments = pgTable(
  "assessments",
  {
    id: uuidPk(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull(), // test | essay | seminar | attendance | project | oral
    maxPoints: smallint("max_points").notNull(),
    dueAt: ts("due_at").notNull(),
  },
  (t) => [index("assessments_course_idx").on(t.courseId)],
);

export const scores = pgTable(
  "scores",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    points: real("points").notNull(),
    gradedAt: ts("graded_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.assessmentId] })],
);

/** Итоговая оценка по дисциплине (зачётка). */
export const finalGrades = pgTable(
  "final_grades",
  {
    id: uuidPk(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    points: smallint("points").notNull(),
    mark: text("mark").notNull(), // 5 | 4 | 3 | 2 | pass | fail
    gradedAt: ts("graded_at").notNull(),
    attempt: smallint("attempt").notNull().default(1),
    retakeAt: ts("retake_at"),
    retakeRoom: text("retake_room"),
  },
  (t) => [uniqueIndex("final_grades_student_course_idx").on(t.studentId, t.courseId)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuidPk(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    pairNo: smallint("pair_no").notNull(),
    room: text("room").notNull(),
    building: text("building").notNull(),
    format: lessonFormatEnum("format").notNull(),
    status: lessonStatusEnum("status").notNull().default("scheduled"),
    changeNote: text("change_note"),
    prevStartsAt: ts("prev_starts_at"),
    prevRoom: text("prev_room"),
    prevTeacher: text("prev_teacher"),
    substituteTeacher: text("substitute_teacher"),
    changedAt: ts("changed_at"),
  },
  (t) => [index("lessons_course_time_idx").on(t.courseId, t.startsAt), index("lessons_time_idx").on(t.startsAt)],
);

// ───────────────────────── Коммуникации ─────────────────────────

export const announcements = pgTable(
  "announcements",
  {
    id: uuidPk(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull(), // study | scholarship | events | mobility | campus | office
    // перевод для английского интерфейса: у демо-новостей из сида, у новых его готовит Атташе после публикации
    titleEn: text("title_en"),
    bodyEn: text("body_en"),
    important: boolean("important").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    // Аудитория: null = все
    facultyId: text("faculty_id").references(() => faculties.id),
    course: smallint("course"),
    groupId: text("group_id").references(() => groups.id),
    authorName: text("author_name").notNull(),
    publishedAt: ts("published_at").notNull().defaultNow(),
  },
  (t) => [index("announcements_published_idx").on(t.publishedAt)],
);

export const deadlines = pgTable("deadlines", {
  id: uuidPk(),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: ts("due_at").notNull(),
  kind: text("kind").notNull(), // study | admin | finance | mobility
  facultyId: text("faculty_id").references(() => faculties.id),
  course: smallint("course"),
  groupId: text("group_id").references(() => groups.id),
  funding: text("funding"),
  link: text("link"),
});

export const deadlineDone = pgTable(
  "deadline_done",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** id дедлайна или контрольной точки (assessment) */
    itemId: text("item_id").notNull(),
    doneAt: ts("done_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.itemId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // английский текст для английского интерфейса (src/lib/notify-text.ts); null: показывается русский
    titleEn: text("title_en"),
    bodyEn: text("body_en"),
    link: text("link"),
    important: boolean("important").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

// ───────────────────────── Заявки ─────────────────────────

export const requests = pgTable(
  "requests",
  {
    id: uuidPk(),
    number: text("number").notNull().unique(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // slug из каталога
    status: requestStatusEnum("status").notNull().default("submitted"),
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    delivery: deliveryEnum("delivery").notNull().default("electronic"),
    copies: smallint("copies").notNull().default(1),
    comment: text("comment"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    dueAt: ts("due_at").notNull(),
    readyAt: ts("ready_at"),
    verifyCode: text("verify_code").unique(),
    documentNo: text("document_no"),
    assignedStaffId: text("assigned_staff_id").references(() => staff.id),
  },
  (t) => [index("requests_student_idx").on(t.studentId, t.createdAt), index("requests_status_idx").on(t.status)],
);

export const requestEvents = pgTable(
  "request_events",
  {
    id: uuidPk(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    status: requestStatusEnum("status"),
    message: text("message"),
    actor: actorEnum("actor").notNull(),
    actorName: text("actor_name").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("request_events_request_idx").on(t.requestId, t.createdAt)],
);

// ───────────────────────── Запись на приём ─────────────────────────

/** Запись на приём в учебный офис факультета вместо живой очереди. Слоты считаются из часов работы. */
export const appointments = pgTable(
  "appointments",
  {
    id: uuidPk(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** учебный офис факультета студента на момент записи */
    facultyId: text("faculty_id")
      .notNull()
      .references(() => faculties.id),
    startsAt: ts("starts_at").notNull(),
    durationMin: smallint("duration_min").notNull().default(15),
    topic: text("topic").notNull(), // certificate | documents | plan | scholarship | mobility | other
    comment: text("comment"),
    status: appointmentStatusEnum("status").notNull().default("booked"),
    /** короткий код талона, его называют в офисе */
    code: text("code").notNull().unique(),
    /** причина отмены учебным офисом; null, если отменил сам студент */
    cancelReason: text("cancel_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Один слот офиса занимает только одна активная запись: защита от двойного бронирования на уровне БД
    uniqueIndex("appointments_slot_booked_idx").on(t.facultyId, t.startsAt).where(sql`status = 'booked'`),
    index("appointments_student_idx").on(t.studentId, t.startsAt),
    index("appointments_faculty_time_idx").on(t.facultyId, t.startsAt),
  ],
);

// ───────────────────────── Оплата обучения ─────────────────────────

/** График платежей по договору для студентов на контракте. Только показ: оплаты через кабинет нет. */
export const tuitionPayments = pgTable(
  "tuition_payments",
  {
    id: uuidPk(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    contractNo: text("contract_no").notNull(),
    /** «Весенний семестр 2026/27» */
    period: text("period").notNull(),
    /** сумма в рублях */
    amount: integer("amount").notNull(),
    dueAt: ts("due_at").notNull(),
    paidAt: ts("paid_at"),
    /** номер платёжного документа, когда оплата поступила */
    receiptNo: text("receipt_no"),
    /** когда учебный офис последний раз напомнил о сроке */
    remindedAt: ts("reminded_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tuition_student_idx").on(t.studentId, t.dueAt), index("tuition_due_idx").on(t.dueAt)],
);

// ───────────────────────── Больничный ─────────────────────────

/** Сообщение о болезни: открывается в день болезни, закрывается справкой, проверяется учебным офисом. */
export const sickLeaves = pgTable(
  "sick_leaves",
  {
    id: uuidPk(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    /** null, пока студент болеет */
    endsOn: date("ends_on", { mode: "string" }),
    comment: text("comment"),
    status: sickLeaveStatusEnum("status").notNull().default("open"),
    reviewerId: text("reviewer_id").references(() => staff.id),
    reviewNote: text("review_note"),
    reviewedAt: ts("reviewed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("sick_leaves_student_idx").on(t.studentId, t.createdAt), index("sick_leaves_status_idx").on(t.status)],
);

/** Скан или фото медицинской справки. Отдаётся только владельцу и сотруднику его области. */
export const sickLeaveFiles = pgTable(
  "sick_leave_files",
  {
    id: uuidPk(),
    sickLeaveId: text("sick_leave_id")
      .notNull()
      .references(() => sickLeaves.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sick_leave_files_leave_idx").on(t.sickLeaveId)],
);

// ───────────────────────── Push-уведомления ─────────────────────────

/** Подписка браузера на Web Push. Ключи шифрования принадлежат браузеру, сервер хранит только их публичную часть. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSuccessAt: ts("last_success_at"),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// ───────────────────────── Пересдачи ─────────────────────────

/** Пересдача по дисциплине: дата, аудитория, комиссия. attempt 2: у преподавателя, 3: комиссионная. */
export const retakeSessions = pgTable(
  "retake_sessions",
  {
    id: uuidPk(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    attempt: smallint("attempt").notNull().default(2),
    startsAt: ts("starts_at").notNull(),
    room: text("room").notNull(),
    /** ФИО членов комиссии (для attempt 2 обычно один преподаватель) */
    commission: jsonb("commission").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    note: text("note"),
    createdByStaffId: text("created_by_staff_id").references(() => staff.id),
    /** когда студенты получили направления и уведомления; null, пока это черновик графика */
    publishedAt: ts("published_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("retake_sessions_course_idx").on(t.courseId), index("retake_sessions_time_idx").on(t.startsAt)],
);

/** Направление на пересдачу конкретного студента. */
export const retakeReferrals = pgTable(
  "retake_referrals",
  {
    id: uuidPk(),
    retakeSessionId: text("retake_session_id")
      .notNull()
      .references(() => retakeSessions.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    finalGradeId: text("final_grade_id").references(() => finalGrades.id, { onDelete: "set null" }),
    /** номер направления, например «П-2026-0142» */
    number: text("number").notNull().unique(),
    status: retakeStatusEnum("status").notNull().default("issued"),
    resultMark: text("result_mark"), // 5 | 4 | 3 | 2 | pass | fail
    resultPoints: smallint("result_points"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("retake_referrals_session_student_idx").on(t.retakeSessionId, t.studentId),
    index("retake_referrals_student_idx").on(t.studentId),
  ],
);

// ───────────────────────── Журнал действий ─────────────────────────

/**
 * Журнал действий: кто, когда и с чьими данными работал. Только добавление:
 * UPDATE и DELETE запрещены триггером в БД (миграция audit_append_only).
 * Внешних ключей нет сознательно: запись должна пережить удаление пользователя.
 * В summary нет персональных данных, только что сделано («Засчитан больничный 3-7 ноября»).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    actorRole: roleEnum("actor_role"),
    /** ФИО сотрудника на момент действия */
    actorName: text("actor_name"),
    /** например request.status, sick_leave.approve, payment.mark_paid, student.view, file.view */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** чьи данные затронуты: по нему студент видит «кто обращался к моим данным» */
    studentId: text("student_id"),
    /** факультет студента: по нему журнал ограничен областью сотрудника */
    facultyId: text("faculty_id"),
    summary: text("summary").notNull(),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_student_idx").on(t.studentId, t.createdAt),
    index("audit_log_actor_idx").on(t.actorUserId, t.createdAt),
    index("audit_log_faculty_idx").on(t.facultyId, t.createdAt),
  ],
);

export const assistantUsage = pgTable(
  "assistant_usage",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    tokens: integer("tokens").notNull().default(0),
  },
  (t) => [index("assistant_usage_user_idx").on(t.userId, t.createdAt)],
);

// ───────────────────────── Связи (для db.query) ─────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  student: one(students, { fields: [users.id], references: [students.userId] }),
  staff: one(staff, { fields: [users.id], references: [staff.userId] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const facultiesRelations = relations(faculties, ({ many }) => ({
  groups: many(groups),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  faculty: one(faculties, { fields: [groups.facultyId], references: [faculties.id] }),
  students: many(students),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] }),
  group: one(groups, { fields: [students.groupId], references: [groups.id] }),
  enrollments: many(enrollments),
  requests: many(requests),
  finalGrades: many(finalGrades),
  scores: many(scores),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  user: one(users, { fields: [staff.userId], references: [users.id] }),
  faculty: one(faculties, { fields: [staff.facultyId], references: [faculties.id] }),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  discipline: one(disciplines, { fields: [courses.disciplineId], references: [disciplines.id] }),
  teacher: one(teachers, { fields: [courses.teacherId], references: [teachers.id] }),
  group: one(groups, { fields: [courses.groupId], references: [groups.id] }),
  enrollments: many(enrollments),
  assessments: many(assessments),
  lessons: many(lessons),
  finalGrades: many(finalGrades),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(students, { fields: [enrollments.studentId], references: [students.id] }),
  course: one(courses, { fields: [enrollments.courseId], references: [courses.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  course: one(courses, { fields: [assessments.courseId], references: [courses.id] }),
  scores: many(scores),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  student: one(students, { fields: [scores.studentId], references: [students.id] }),
  assessment: one(assessments, { fields: [scores.assessmentId], references: [assessments.id] }),
}));

export const finalGradesRelations = relations(finalGrades, ({ one }) => ({
  student: one(students, { fields: [finalGrades.studentId], references: [students.id] }),
  course: one(courses, { fields: [finalGrades.courseId], references: [courses.id] }),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
}));

export const requestsRelations = relations(requests, ({ one, many }) => ({
  student: one(students, { fields: [requests.studentId], references: [students.id] }),
  events: many(requestEvents),
  assignedStaff: one(staff, { fields: [requests.assignedStaffId], references: [staff.id] }),
}));

export const requestEventsRelations = relations(requestEvents, ({ one }) => ({
  request: one(requests, { fields: [requestEvents.requestId], references: [requests.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  faculty: one(faculties, { fields: [announcements.facultyId], references: [faculties.id] }),
  group: one(groups, { fields: [announcements.groupId], references: [groups.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  student: one(students, { fields: [appointments.studentId], references: [students.id] }),
  faculty: one(faculties, { fields: [appointments.facultyId], references: [faculties.id] }),
}));

export const tuitionPaymentsRelations = relations(tuitionPayments, ({ one }) => ({
  student: one(students, { fields: [tuitionPayments.studentId], references: [students.id] }),
}));

export const sickLeavesRelations = relations(sickLeaves, ({ one, many }) => ({
  student: one(students, { fields: [sickLeaves.studentId], references: [students.id] }),
  reviewer: one(staff, { fields: [sickLeaves.reviewerId], references: [staff.id] }),
  files: many(sickLeaveFiles),
}));

export const sickLeaveFilesRelations = relations(sickLeaveFiles, ({ one }) => ({
  sickLeave: one(sickLeaves, { fields: [sickLeaveFiles.sickLeaveId], references: [sickLeaves.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const retakeSessionsRelations = relations(retakeSessions, ({ one, many }) => ({
  course: one(courses, { fields: [retakeSessions.courseId], references: [courses.id] }),
  createdBy: one(staff, { fields: [retakeSessions.createdByStaffId], references: [staff.id] }),
  referrals: many(retakeReferrals),
}));

export const retakeReferralsRelations = relations(retakeReferrals, ({ one }) => ({
  session: one(retakeSessions, { fields: [retakeReferrals.retakeSessionId], references: [retakeSessions.id] }),
  student: one(students, { fields: [retakeReferrals.studentId], references: [students.id] }),
  finalGrade: one(finalGrades, { fields: [retakeReferrals.finalGradeId], references: [finalGrades.id] }),
}));

export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Faculty = typeof faculties.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type RequestStatus = (typeof requestStatusEnum.enumValues)[number];
export type LessonStatus = (typeof lessonStatusEnum.enumValues)[number];
export type LessonFormat = (typeof lessonFormatEnum.enumValues)[number];
export type ControlType = (typeof controlTypeEnum.enumValues)[number];
export type NotificationKind = (typeof notificationKindEnum.enumValues)[number];
export type Appointment = typeof appointments.$inferSelect;
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type TuitionPayment = typeof tuitionPayments.$inferSelect;
export type SickLeave = typeof sickLeaves.$inferSelect;
export type SickLeaveStatus = (typeof sickLeaveStatusEnum.enumValues)[number];
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type RetakeSession = typeof retakeSessions.$inferSelect;
export type RetakeReferral = typeof retakeReferrals.$inferSelect;
export type RetakeStatus = (typeof retakeStatusEnum.enumValues)[number];
export type AuditEntry = typeof auditLog.$inferSelect;

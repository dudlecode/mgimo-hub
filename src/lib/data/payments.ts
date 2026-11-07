import "server-only";
// Оплата обучения. Только показ графика и отметки учебного офиса: платежей через кабинет нет.
// Студент видит только свои платежи (student.id из сессии), сотрудник только студентов своей области.
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff, requireStudent } from "@/lib/auth/dal";
import { notify } from "@/lib/data/notify";
import { getSemester } from "@/lib/academic";
import { DAY_MS } from "@/lib/time";
import { canRemind, paymentState, periodForPurpose, REMIND_COOLDOWN_MS, SOON_DAYS, type PaymentState } from "@/lib/payments";
import { audit, auditMany } from "@/lib/audit";
import { paymentText } from "@/lib/notify-text";

const uuid = z.string().uuid();

// ───────────── Студент ─────────────

export async function getMyPayments() {
  const { student, faculty } = await requireStudent();
  const office = { code: faculty.code, room: faculty.officeRoom, hours: faculty.officeHours, phone: faculty.officePhone, email: faculty.officeEmail };
  if (student.funding !== "contract") return { funding: "budget" as const, office, payments: [], contractNo: null };
  const payments = await db
    .select({
      id: s.tuitionPayments.id,
      contractNo: s.tuitionPayments.contractNo,
      period: s.tuitionPayments.period,
      amount: s.tuitionPayments.amount,
      dueAt: s.tuitionPayments.dueAt,
      paidAt: s.tuitionPayments.paidAt,
      receiptNo: s.tuitionPayments.receiptNo,
    })
    .from(s.tuitionPayments)
    .where(eq(s.tuitionPayments.studentId, student.id))
    .orderBy(asc(s.tuitionPayments.dueAt));
  return { funding: "contract" as const, office, payments, contractNo: payments.at(-1)?.contractNo ?? null };
}

export type MyPayment = Awaited<ReturnType<typeof getMyPayments>>["payments"][number];

/** Квитанция по id из адреса: только своя запись, иначе 404 */
export async function getMyPaymentReceipt(id: string) {
  const { student, group, faculty } = await requireStudent();
  if (!uuid.safeParse(id).success) notFound();
  const [payment] = await db
    .select()
    .from(s.tuitionPayments)
    .where(and(eq(s.tuitionPayments.id, id), eq(s.tuitionPayments.studentId, student.id)))
    .limit(1);
  if (!payment) notFound();
  return {
    payment,
    student: { lastName: student.lastName, firstName: student.firstName, middleName: student.middleName, recordBook: student.recordBook },
    group: { code: group.code, course: group.course, programCode: group.programCode, programName: group.programName },
    faculty: { id: faculty.id, code: faculty.code, name: faculty.name },
  };
}

// ───────────── Учебный офис ─────────────

/** Студенты на контракте в области сотрудника (facultyId null: все факультеты) */
function scopedContractStudents(facultyId: string | null) {
  return db
    .select({ id: s.students.id })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(eq(s.students.funding, "contract"), facultyId ? eq(s.groups.facultyId, facultyId) : undefined));
}

function scopedRows(facultyId: string | null, extra?: SQL) {
  return db
    .select({
      id: s.tuitionPayments.id,
      studentId: s.students.id,
      period: s.tuitionPayments.period,
      amount: s.tuitionPayments.amount,
      dueAt: s.tuitionPayments.dueAt,
      paidAt: s.tuitionPayments.paidAt,
      receiptNo: s.tuitionPayments.receiptNo,
      remindedAt: s.tuitionPayments.remindedAt,
      contractNo: s.tuitionPayments.contractNo,
      lastName: s.students.lastName,
      firstName: s.students.firstName,
      middleName: s.students.middleName,
      groupCode: s.groups.code,
      facultyCode: s.faculties.code,
    })
    .from(s.tuitionPayments)
    .innerJoin(s.students, eq(s.students.id, s.tuitionPayments.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
    .where(and(eq(s.students.funding, "contract"), facultyId ? eq(s.groups.facultyId, facultyId) : undefined, extra))
    .orderBy(asc(s.tuitionPayments.dueAt));
}

export type StaffPaymentRow = Awaited<ReturnType<typeof scopedRows>>[number] & { state: PaymentState };

export const STAFF_PAYMENT_FILTERS = ["overdue", "soon", "all"] as const;
export type StaffPaymentFilter = (typeof STAFF_PAYMENT_FILTERS)[number];

const STATE_ORDER: Record<PaymentState, number> = { overdue: 0, soon: 1, upcoming: 2, paid: 3 };

/** Сводка и строки для экрана «Оплата» учебного офиса */
export async function getStaffPayments(filter: StaffPaymentFilter) {
  const { staff } = await requireStaff();
  const now = new Date();
  const rows: StaffPaymentRow[] = (await scopedRows(staff.facultyId)).map((r) => ({ ...r, state: paymentState(r, now) }));

  const overdue = rows.filter((r) => r.state === "overdue");
  const soon = rows.filter((r) => r.state === "soon");
  const semLabel = getSemester(now).label;
  const current = rows.filter((r) => r.period === semLabel);
  const currentPaid = current.filter((r) => r.paidAt).length;

  // «Все»: каждый студент один раз, с ближайшим неоплаченным платежом или последним оплаченным
  const byStudent = new Map<string, StaffPaymentRow>();
  for (const r of rows) {
    const prev = byStudent.get(r.studentId);
    if (!prev) byStudent.set(r.studentId, r);
    else if (prev.paidAt && (!r.paidAt || r.dueAt > prev.dueAt)) byStudent.set(r.studentId, r);
  }
  const perStudent = [...byStudent.values()].sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.state === "paid" ? a.lastName.localeCompare(b.lastName, "ru") : a.dueAt.getTime() - b.dueAt.getTime()),
  );

  const list = filter === "overdue" ? overdue : filter === "soon" ? soon : perStudent;
  return {
    rows: list,
    stats: {
      students: byStudent.size,
      overdueCount: overdue.length,
      overdueSum: overdue.reduce((a, r) => a + r.amount, 0),
      soonCount: soon.length,
      soonSum: soon.reduce((a, r) => a + r.amount, 0),
      semLabel,
      currentTotal: current.length,
      currentPaid,
      paidShare: current.length ? Math.round((currentPaid / current.length) * 100) : 0,
    },
    remindable: list.filter((r) => r.state !== "paid" && r.state !== "upcoming" && canRemind(r.remindedAt, now)).length,
  };
}

/** Платёж в области сотрудника; вне области null */
export async function getScopedPayment(id: string) {
  const { staff } = await requireStaff();
  if (!uuid.safeParse(id).success) return null;
  const [row] = await scopedRows(staff.facultyId, eq(s.tuitionPayments.id, id)).limit(1);
  return row ?? null;
}

/** id неоплаченных платежей по фильтру «Просрочено» или «Скоро срок», которым можно напомнить */
export async function listReminderTargets(filter: "overdue" | "soon") {
  const { staff } = await requireStaff();
  const now = new Date();
  const soonEdge = new Date(now.getTime() + SOON_DAYS * DAY_MS);
  const rows = await scopedRows(staff.facultyId, isNull(s.tuitionPayments.paidAt));
  return rows
    .filter((r) => (filter === "overdue" ? r.dueAt < now : r.dueAt >= now && r.dueAt <= soonEdge))
    .filter((r) => canRemind(r.remindedAt, now))
    .map((r) => r.id);
}

/**
 * Напоминание студентам: ставит remindedAt и отправляет уведомление.
 * Область сотрудника, «не оплачено» и «не чаще раза в сутки» проверяются в самом UPDATE,
 * поэтому двойной клик или параллельный запрос не отправят напоминание дважды.
 */
export async function sendPaymentReminders(ids: string[]) {
  const { staff } = await requireStaff();
  const valid = ids.filter((x) => uuid.safeParse(x).success).slice(0, 500);
  if (!valid.length) return 0;
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMIND_COOLDOWN_MS);
  const updated = await db
    .update(s.tuitionPayments)
    .set({ remindedAt: now })
    .where(
      and(
        inArray(s.tuitionPayments.id, valid),
        isNull(s.tuitionPayments.paidAt),
        or(isNull(s.tuitionPayments.remindedAt), lt(s.tuitionPayments.remindedAt, cutoff)),
        inArray(s.tuitionPayments.studentId, scopedContractStudents(staff.facultyId)),
      ),
    )
    .returning({ id: s.tuitionPayments.id, studentId: s.tuitionPayments.studentId, period: s.tuitionPayments.period, amount: s.tuitionPayments.amount, dueAt: s.tuitionPayments.dueAt });
  if (!updated.length) return 0;

  const users = await db
    .select({ id: s.students.id, userId: s.students.userId })
    .from(s.students)
    .where(inArray(s.students.id, [...new Set(updated.map((u) => u.studentId))]));
  const userOf = new Map(users.map((u) => [u.id, u.userId]));
  await notify(
    updated.flatMap((p) => {
      const userId = userOf.get(p.studentId);
      if (!userId) return [];
      const late = p.dueAt < now;
      return [
        {
          userId,
          kind: "payment" as const,
          ...(late ? paymentText.overdue(p.period, p.amount, p.dueAt) : paymentText.soon(p.period, p.amount, p.dueAt)),
          link: "/payments",
          important: true,
        },
      ];
    }),
  );
  await auditMany(
    updated.map((p) => ({
      action: "payment.remind" as const,
      entityType: "tuition_payment",
      entityId: p.id,
      studentId: p.studentId,
      summary: `Отправлено напоминание об оплате за ${periodForPurpose(p.period)}`,
    })),
  );
  return updated.length;
}

/** Отметка учебного офиса о поступившей оплате. Повторно отметить нельзя. */
export async function recordPayment(id: string, receiptNo: string, paidAt: Date): Promise<"ok" | "not_found" | "already_paid"> {
  const { staff } = await requireStaff();
  const row = await getScopedPayment(id);
  if (!row) return "not_found";
  if (row.paidAt) return "already_paid";
  const updated = await db
    .update(s.tuitionPayments)
    .set({ paidAt, receiptNo })
    .where(and(eq(s.tuitionPayments.id, row.id), isNull(s.tuitionPayments.paidAt), inArray(s.tuitionPayments.studentId, scopedContractStudents(staff.facultyId))))
    .returning({ id: s.tuitionPayments.id });
  if (!updated.length) return "already_paid";

  const [st] = await db.select({ userId: s.students.userId }).from(s.students).where(eq(s.students.id, row.studentId));
  if (st) {
    await notify({
      userId: st.userId,
      kind: "payment",
      ...paymentText.received(row.period, row.amount, receiptNo),
      link: "/payments",
    });
  }
  await audit({ action: "payment.mark_paid", entityType: "tuition_payment", entityId: row.id, studentId: row.studentId, summary: `Отмечена оплата за ${periodForPurpose(row.period)}` });
  return "ok";
}

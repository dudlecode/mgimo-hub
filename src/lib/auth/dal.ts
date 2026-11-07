import "server-only";
// Data Access Layer: единственная точка, где определяется «кто я».
// Каждая функция в src/lib/data/* начинается с requireStudent()/requireStaff().
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "./session";

export const requireUser = cache(async () => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
});

export const requireStudent = cache(async () => {
  const session = await requireUser();
  if (session.user.role !== "student") redirect("/staff");
  const student = await db.query.students.findFirst({
    where: eq(s.students.userId, session.user.id),
    with: { group: { with: { faculty: true } } },
  });
  if (!student) redirect("/login");
  return { session, user: session.user, student, group: student.group, faculty: student.group.faculty };
});

export const requireStaff = cache(async () => {
  const session = await requireUser();
  if (session.user.role !== "staff") redirect("/");
  const member = await db.query.staff.findFirst({
    where: eq(s.staff.userId, session.user.id),
    with: { faculty: true },
  });
  if (!member) redirect("/login");
  return { session, user: session.user, staff: member };
});

export type StudentCtx = Awaited<ReturnType<typeof requireStudent>>;
export type StaffCtx = Awaited<ReturnType<typeof requireStaff>>;

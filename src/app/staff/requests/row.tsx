import Link from "next/link";

import type { RequestStatus } from "@/db/schema";
import { getRequestType } from "@/lib/requests/catalog";

import { StatusBadge } from "@/components/feature/request-bits";
import { formatDayMonth, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type StaffRow = {
  id: string;
  studentId: string;
  number: string;
  type: string;
  status: RequestStatus;
  createdAt: Date;
  dueAt: Date;
  lastName: string;
  firstName: string;
  groupCode: string;
  facultyCode: string;
  delivery: "electronic" | "paper";
};

export function StaffRequestRow({ r, now }: { r: StaffRow; now: Date }) {
  const def = getRequestType(r.type);
  const open = ["submitted", "in_review", "in_progress"].includes(r.status);
  const overdue = open && r.dueAt < now;
  return (
    // Вся строка ведёт к заявке (растянутая ссылка), ФИО отдельной ссылкой ведёт в карточку студента
    <div className="group relative flex items-center gap-3 rounded-[10px] p-3 transition-colors hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/staff/requests/${r.id}`} className="truncate text-[14px] font-semibold after:absolute after:inset-0 after:rounded-[10px]">
            {def?.title ?? r.type}
          </Link>
          <span className="text-[12px] text-ink-3">{r.number}</span>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-ink-2">
          <Link href={`/staff/students/${r.studentId}`} prefetch={false} className="relative z-10 hover:text-ink hover:underline">
            {r.lastName} {r.firstName[0]}.
          </Link>{" "}
          · {r.groupCode} · {r.facultyCode}
          {r.delivery === "paper" && " · бумага"}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <StatusBadge status={r.status} />
        <div className={cn("mt-1 text-[11px]", overdue ? "font-semibold text-danger" : "text-ink-3")}>
          {overdue ? `просрочена с ${formatDayMonth(r.dueAt)}` : open ? `до ${formatDayMonth(r.dueAt)}` : relativeTime(r.createdAt, now)}
        </div>
      </div>
    </div>
  );
}

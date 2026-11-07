"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Фильтр по группе: меняет ?group= в адресе, уровень сохраняется. */
export function GroupFilter({ groups, value, level }: { groups: { id: string; label: string }[]; value: string; level: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("w-full sm:w-60", pending && "opacity-60")}>
      <Select
        aria-label="Группа"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const p = new URLSearchParams();
          if (e.target.value) p.set("group", e.target.value);
          if (level) p.set("level", level);
          const qs = p.toString();
          startTransition(() => router.replace(qs ? `/staff/radar?${qs}` : "/staff/radar", { scroll: false }));
        }}
      >
        <option value="">Все группы</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

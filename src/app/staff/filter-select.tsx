"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui/field";

/** Выпадающий фильтр внутри GET-формы: выбор сразу отправляет форму, остальные поля формы сохраняются. */
export function FilterSelect(props: Omit<ComponentProps<typeof Select>, "onChange">) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

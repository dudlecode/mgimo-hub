"use client";

import { useState } from "react";

import { GRADE_RULES, markFromPoints, markLabel } from "@/lib/grades";
import type { ControlType } from "@/db/schema";
import { cn } from "@/lib/utils";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { calculatorMessages } from "@/lib/i18n/messages/grades";

/** What-if калькулятор: «если за семестр будет X, а на экзамене Y, какая оценка?» */
export function GradeCalculator({ projectedSemester, controlType }: { projectedSemester: number; controlType: ControlType }) {
  const locale = useLocale();
  const t = useMessages(calculatorMessages);
  const [sem, setSem] = useState(Math.min(GRADE_RULES.semesterMax, Math.max(0, projectedSemester)));
  const [exam, setExam] = useState(Math.min(GRADE_RULES.examMax, Math.max(0, Math.ceil(GRADE_RULES.excellent - projectedSemester))));
  const total = sem + exam;
  const mark = markFromPoints(total, controlType);
  const admitted = sem >= GRADE_RULES.admissionMin;
  const auto = sem >= GRADE_RULES.autoMin;

  const thresholds =
    controlType === "credit"
      ? [{ label: t.thresholds.pass, min: GRADE_RULES.passMin }]
      : [
          { label: t.thresholds.excellent, min: GRADE_RULES.excellent },
          { label: t.thresholds.good, min: GRADE_RULES.good },
          { label: t.thresholds.ok, min: GRADE_RULES.satisfactory },
        ];

  const tone = !admitted ? "danger" : mark === "5" || mark === "pass" ? "success" : mark === "4" ? "brand" : mark === "3" ? "warning" : "danger";
  const toneCls = {
    success: { bg: "bg-success-soft", text: "text-success" },
    brand: { bg: "bg-brand-soft", text: "text-brand-fg" },
    warning: { bg: "bg-warning-soft", text: "text-warning" },
    danger: { bg: "bg-danger-soft", text: "text-danger" },
  }[tone];

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" aria-labelledby="calc-title">
      <div className="mb-4 flex items-center gap-2">
        <h2 id="calc-title" className="text-[16px] font-semibold">
          {t.title}
        </h2>
      </div>

      <Slider id="calc-sem" label={t.semester} value={sem} max={GRADE_RULES.semesterMax} onChange={setSem} marker={GRADE_RULES.admissionMin} markerLabel={t.admissionMark} />
      <div className="h-6" />
      <Slider id="calc-exam" label={controlType === "credit" ? t.credit : t.exam} value={exam} max={GRADE_RULES.examMax} onChange={setExam} />

      <div className={cn("mt-5 flex items-center justify-between gap-3 rounded-[10px] px-5 py-4", toneCls.bg)}>
        <div>
          <div className="text-[12px] font-medium text-ink-2">{t.total}</div>
          <div className="text-[26px] leading-none font-semibold tabular">
            {total}
            <span className="text-[15px] text-ink-3"> / 100</span>
          </div>
        </div>
        <div className={cn("text-right font-serif text-[22px] font-semibold", toneCls.text)}>{admitted ? markLabel(mark, locale) : t.notAdmitted}</div>
      </div>

      <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
        {!admitted && <li>{t.needAdmission(GRADE_RULES.admissionMin)}</li>}
        {auto && controlType !== "credit" && <li>{t.auto(GRADE_RULES.autoMin)}</li>}
        {admitted &&
          thresholds.map((th) => {
            const need = th.min - sem;
            return (
              <li key={th.label} className="flex justify-between gap-3">
                <span>{t.for(th.label)}</span>
                <span className="font-semibold tabular">{need <= 0 ? t.reached : need > GRADE_RULES.examMax ? t.unreachable : t.need(need, controlType === "credit")}</span>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function Slider({
  id,
  label,
  value,
  max,
  onChange,
  marker,
  markerLabel,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  marker?: number;
  markerLabel?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="text-[14px] font-medium">
          {label}
        </label>
        <span className="rounded-lg bg-surface-2 px-2 py-0.5 text-[14px] font-semibold tabular">
          {value} <span className="text-ink-3">/ {max}</span>
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--brand)]"
        />
        {marker !== undefined && (
          <div className="pointer-events-none absolute top-full mt-1 flex -translate-x-1/2 flex-col items-center text-[10px] leading-none font-medium text-ink-3" style={{ left: `${(marker / max) * 100}%` }} aria-hidden>
            <span className="mb-0.5 h-1.5 w-px bg-ink-3" />
            {markerLabel}
          </div>
        )}
      </div>
    </div>
  );
}

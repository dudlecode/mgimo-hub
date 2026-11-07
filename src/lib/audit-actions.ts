// Коды действий журнала (audit_log.action) и их подписи для фильтра и строк журнала.
// Чистый модуль без БД: можно импортировать и на сервере, и в клиентских компонентах.

export const AUDIT_ACTIONS = {
  "auth.login": "Вход в кабинет",
  "auth.login_failed": "Неудачный вход",
  "student.view": "Карточка студента",
  "request.status": "Статус заявки",
  "request.comment": "Сообщение по заявке",
  "certificate.issue": "Справка оформлена",
  "certificate.print": "Справка для печати",
  "announcement.create": "Объявление опубликовано",
  "announcement.delete": "Объявление удалено",
  "schedule.change": "Изменение расписания",
  "radar.message": "Сообщение из радара",
  "radar.draft": "Черновик в радаре",
  "assistant.reply_draft": "Черновик ответа по заявке",
  "assistant.queue_summary": "Сводка очереди",
  "appointment.mark": "Отметка о приёме",
  "appointment.cancel": "Отмена записи на приём",
  "payment.remind": "Напоминание об оплате",
  "payment.mark_paid": "Отметка об оплате",
  "sick_leave.approve": "Больничный засчитан",
  "sick_leave.reject": "Больничный отклонён",
  "file.view": "Файл справки о болезни",
  // Пересдачи: коды заведены заранее, вызовы audit() добавляет автор раздела /staff/retakes
  "retake.schedule": "Пересдача назначена",
  "retake.publish": "Направление на пересдачу",
  "retake.delete_draft": "Черновик пересдачи удалён",
  "retake.result": "Результат пересдачи",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ACTION_CODES = Object.keys(AUDIT_ACTIONS) as [AuditAction, ...AuditAction[]];

export function auditActionLabel(code: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[code] ?? code;
}

/** Просмотры (карточка, файл, печать) пишутся не чаще раза в столько минут на сотрудника и студента */
export const AUDIT_VIEW_DEDUPE_MIN = 10;

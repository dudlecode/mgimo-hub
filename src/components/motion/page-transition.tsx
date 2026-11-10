/**
 * Мягкий вход страницы при каждой навигации (используется в template.tsx).
 * Анимация на CSS: HTML с сервера виден сразу, без ожидания JS, и нет расхождений при гидрации.
 * Системную настройку «меньше движения» учитывает общий блок в globals.css.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}

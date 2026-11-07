// Пресеты движения MGIMO Hub (навык page-load-animations): сдержанные пружины, короткие каскады.
export const SPRING = {
  smooth: { type: "spring", stiffness: 300, damping: 30 },
  snappy: { type: "spring", stiffness: 400, damping: 30 },
} as const;

/*
 * Раскадровка входа страницы (мс от монтирования)
 *   0  контейнер страницы: opacity 0, y 8
 *  60  секция 1 поднимается
 * 120  секция 2
 * 180  секция 3 …
 * 350  всё на месте; строки списков догоняют каскадом по 30 мс (CSS)
 */
export const TIMING = {
  pageY: 8,
  sectionStep: 0.06,
  sectionDelay: 0.04,
  sectionY: 10,
  countUpMs: 700,
} as const;

import { PageSkeleton } from "@/components/feature/page-skeleton";

// Скелетон очереди. Лежит в группе (queue), чтобы не оборачивать вложенные экраны с notFound(): иначе 404 отдаётся со статусом 200
export default function Loading() {
  return <PageSkeleton variant="dashboard" />;
}

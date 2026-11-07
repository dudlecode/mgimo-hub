import {
  CirclePause,
  FileCheck2,
  Flag,
  HeartHandshake,
  IdCard,
  Plane,
  Repeat2,
  RotateCcw,
  Route,
  ScrollText,
  ShieldCheck,
  Wallet,
  FileText,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/** Иконки типов заявок (имена из src/lib/requests/catalog.ts) */
const REQUEST_ICONS: Record<string, LucideIcon> = {
  "file-check": FileCheck2,
  plane: Plane,
  shield: ShieldCheck,
  wallet: Wallet,
  scroll: ScrollText,
  route: Route,
  pause: CirclePause,
  repeat: Repeat2,
  rotate: RotateCcw,
  heart: HeartHandshake,
  "id-card": IdCard,
  flag: Flag,
};

export function requestIcon(name: string | undefined): LucideIcon {
  return (name && REQUEST_ICONS[name]) || FileText;
}

/** Иконка типа заявки как компонент (без создания компонентов во время рендера). */
export function RequestIcon({ name, ...props }: { name: string | undefined } & LucideProps) {
  const Icon = (name && REQUEST_ICONS[name]) || FileText;
  return <Icon {...props} />;
}

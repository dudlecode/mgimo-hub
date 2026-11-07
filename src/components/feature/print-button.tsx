"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { useSharedMessages } from "@/components/shell/use-shared-messages";

export function PrintButton() {
  const t = useSharedMessages(shellMessages);
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4.5" aria-hidden />
      {t.print}
    </Button>
  );
}

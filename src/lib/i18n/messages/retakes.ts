// Направление на пересдачу: окружающий интерфейс. Сам бланк, официальный русский документ, не переводится.
import { defineMessages } from "../define";

export const retakeMessages = defineMessages(
  {
    metaTitle: "Направление на пересдачу",
    grades: "Учёба",
    referral: (no: string) => `Направление № ${no}`,
  },
  {
    metaTitle: "Retake referral",
    grades: "Studies",
    referral: (no) => `Retake referral No. ${no}`,
  },
);

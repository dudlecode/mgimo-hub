// Демо-больничные: «массовка» МО и МЭО (на проверке со справкой, болеют сейчас, засчитанные за прошлый месяц)
// и один засчитанный больничный у демо-студентки Лейлы. Справка, это маленький PNG «Справка 095/у, образец»,
// нарисованный кодом. Повторный запуск сначала удаляет больничные этих же студентов.
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema as s } from "../client";
import { addDays, dayKey, mskDate, mskParts, startOfMskDay } from "@/lib/time";

// ───────────── PNG без зависимостей ─────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Пиксельный шрифт 5×9 только для нужных символов (строки 7-8 для хвостов «р», «у», «ц», запятой). */
const GLYPHS: Record<string, string[]> = {
  С: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  п: [".....", ".....", "####.", "#..#.", "#..#.", "#..#.", "#..#."],
  р: [".....", ".....", "####.", "#...#", "#...#", "#...#", "####.", "#....", "#...."],
  а: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  в: [".....", ".....", "####.", "#...#", "####.", "#...#", "####."],
  к: [".....", ".....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  у: [".....", ".....", "#...#", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  о: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  б: [".####", "#....", "####.", "#...#", "#...#", "#...#", ".###."],
  з: [".....", ".....", ".###.", "....#", "..##.", "....#", ".###."],
  е: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  ц: [".....", ".....", "#..#.", "#..#.", "#..#.", "#..#.", "#####", "....#"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", "..#..", ".#..."],
  " ": ["...", "...", "...", "...", "...", "...", "..."],
};

type Rgb = [number, number, number];

function makeCertificatePng(): Buffer {
  const W = 480;
  const H = 320;
  const px = Buffer.alloc(W * H * 3, 0xff);
  const set = (x: number, y: number, c: Rgb) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const rect = (x: number, y: number, w: number, h: number, c: Rgb) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c);
  };
  const text = (str: string, x0: number, y0: number, scale: number, c: Rgb) => {
    let x = x0;
    for (const ch of str) {
      const g = GLYPHS[ch] ?? GLYPHS[" "];
      g.forEach((row, gy) => [...row].forEach((v, gx) => v === "#" && rect(x + gx * scale, y0 + gy * scale, scale, scale, c)));
      x += (g[0].length + 1) * scale;
    }
  };

  const ink: Rgb = [24, 24, 27];
  const grey: Rgb = [196, 196, 200];
  const stamp: Rgb = [92, 116, 196];

  // рамка бланка
  rect(12, 12, W - 24, 2, grey);
  rect(12, H - 14, W - 24, 2, grey);
  rect(12, 12, 2, H - 24, grey);
  rect(W - 14, 12, 2, H - 24, grey);

  text("Справка 095/у, образец", 36, 40, 3, ink);
  // строки бланка вместо текста
  [96, 124, 152, 180, 208].forEach((y, i) => rect(36, y, [380, 300, 352, 240, 320][i], 6, grey));
  rect(36, 262, 150, 2, ink); // подпись

  // круглая печать
  const cx = 380;
  const cy = 252;
  for (let y = cy - 46; y <= cy + 46; y++)
    for (let x = cx - 46; x <= cx + 46; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if ((d <= 44 && d >= 40) || (d <= 30 && d >= 28)) set(x, y, stamp);
    }
  text("образец", cx - 21, cy - 5, 1, stamp);

  // строки с фильтром 0 перед каждой
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ───────────── Больничные ─────────────

type Plan = {
  faculty: "mo" | "meo";
  /** индекс студента «массовки» факультета */
  nth: number;
  status: s.SickLeaveStatus;
  start: number; // дней от сегодня
  end: number | null;
  comment?: string;
  reviewer?: "staff.office" | "staff.meo";
  reviewedOffset?: number;
};

const PLANS: Plan[] = [
  // на проверке, справка приложена
  { faculty: "mo", nth: 2, status: "submitted", start: -6, end: -2, comment: "Задания по английскому сдам онлайн" },
  { faculty: "meo", nth: 3, status: "submitted", start: -9, end: -4 },
  { faculty: "mo", nth: 7, status: "submitted", start: -4, end: -1, comment: "На связи по почте" },
  // болеют сейчас
  { faculty: "mo", nth: 11, status: "open", start: -2, end: 3, comment: "На связи по почте, могу писать эссе из дома" },
  { faculty: "meo", nth: 8, status: "open", start: -1, end: null },
  // засчитаны в прошлом месяце
  { faculty: "mo", nth: 5, status: "approved", start: -27, end: -23, reviewer: "staff.office", reviewedOffset: -21 },
  { faculty: "meo", nth: 12, status: "approved", start: -24, end: -19, reviewer: "staff.meo", reviewedOffset: -17 },
  { faculty: "meo", nth: 16, status: "approved", start: -16, end: -13, reviewer: "staff.meo", reviewedOffset: -12 },
];

const LEYLA: Omit<Plan, "faculty" | "nth"> = { status: "approved", start: -25, end: -22, reviewer: "staff.office", reviewedOffset: -20 };

export async function seedSickLeaves(now: Date = new Date()) {
  const today = startOfMskDay(now);
  const at = (offset: number, h: number, min = 0) => {
    const p = mskParts(addDays(today, offset));
    const d = mskDate(p.y, p.m, p.d, h, min);
    return d > now ? new Date(now.getTime() - 60 * 60 * 1000) : d;
  };

  const crowd = await db
    .select({ id: s.students.id, facultyId: s.groups.facultyId })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.users, eq(s.users.id, s.students.userId))
    .where(and(inArray(s.groups.facultyId, ["mo", "meo"]), notInArray(s.users.login, ["student.anna", "student.timur", "student.leyla"])))
    .orderBy(asc(s.students.recordBook));
  const byFaculty: Record<string, string[]> = { mo: [], meo: [] };
  for (const c of crowd) byFaculty[c.facultyId]?.push(c.id);

  const [leyla] = await db
    .select({ id: s.students.id })
    .from(s.students)
    .innerJoin(s.users, eq(s.users.id, s.students.userId))
    .where(eq(s.users.login, "student.leyla"));

  const reviewers = await db
    .select({ id: s.staff.id, login: s.users.login })
    .from(s.staff)
    .innerJoin(s.users, eq(s.users.id, s.staff.userId))
    .where(inArray(s.users.login, ["staff.office", "staff.meo"]));
  const reviewerId = (login?: string) => reviewers.find((r) => r.login === login)?.id ?? null;

  const rows = PLANS.flatMap((p) => {
    const list = byFaculty[p.faculty];
    const studentId = list.length ? list[p.nth % list.length] : undefined;
    return studentId ? [{ ...p, studentId }] : [];
  });
  if (leyla) rows.push({ ...LEYLA, faculty: "mo", nth: 0, studentId: leyla.id });

  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  if (studentIds.length) await db.delete(s.sickLeaves).where(inArray(s.sickLeaves.studentId, studentIds));

  const png = makeCertificatePng();
  const sha256 = createHash("sha256").update(png).digest("hex");

  let files = 0;
  for (const r of rows) {
    const createdAt = at(r.start, 8, 40);
    const closedAt = r.end !== null && r.status !== "open" ? at(r.end + 1, 10, 15) : createdAt;
    const reviewedAt = r.reviewedOffset !== undefined ? at(r.reviewedOffset, 12, 30) : null;
    const [leave] = await db
      .insert(s.sickLeaves)
      .values({
        studentId: r.studentId,
        startsOn: dayKey(addDays(today, r.start)),
        endsOn: r.end === null ? null : dayKey(addDays(today, r.end)),
        comment: r.comment ?? null,
        status: r.status,
        reviewerId: r.status === "approved" ? reviewerId(r.reviewer) : null,
        reviewedAt: r.status === "approved" ? reviewedAt : null,
        createdAt,
        updatedAt: reviewedAt ?? closedAt,
      })
      .returning({ id: s.sickLeaves.id });

    if (r.status !== "open") {
      await db.insert(s.sickLeaveFiles).values({
        sickLeaveId: leave.id,
        fileName: "spravka-095u.png",
        mimeType: "image/png",
        size: png.length,
        sha256,
        data: png,
        createdAt: closedAt,
      });
      files++;
    }
  }
  return { sickLeaves: rows.length, files };
}

import { continueRender, delayRender, staticFile } from "remotion";

const CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LAT =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const FACES: [string, string, string][] = [
  ["Geist", "geist-latin-wght-normal.woff2", LAT],
  ["Geist", "geist-cyrillic-wght-normal.woff2", CYR],
  ["Geist Mono", "geist-mono-latin-wght-normal.woff2", LAT],
  ["Geist Mono", "geist-mono-cyrillic-wght-normal.woff2", CYR],
];

let started = false;

/** Шрифты Geist из public/fonts (OFL), рендер ждёт их загрузки. */
export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Шрифты Geist");
  Promise.all(
    FACES.map(([family, file, range]) =>
      new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format("woff2")`, { weight: "100 900", unicodeRange: range })
        .load()
        .then((f) => {
          (document.fonts as unknown as Set<FontFace>).add(f);
        }),
    ),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}

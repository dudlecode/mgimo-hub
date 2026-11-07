"use client";

// Последний рубеж: ошибка в корневом layout (например, БД недоступна при чтении локали).
// Заменяет весь документ, поэтому свои html/body и стили без зависимостей от globals.css.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "#ffffff",
          color: "#171717",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          fontSize: "14px",
        }}
      >
        <main style={{ maxWidth: "360px", width: "100%", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em" }}>Что-то пошло не так</h1>
          <p style={{ margin: "0 0 20px", color: "#525252", lineHeight: 1.5 }}>
            Обновите страницу. Если не помогло, попробуйте ещё раз через пару минут.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              height: "40px",
              padding: "0 16px",
              border: 0,
              borderRadius: "10px",
              background: "#2F54EB",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
        </main>
      </body>
    </html>
  );
}

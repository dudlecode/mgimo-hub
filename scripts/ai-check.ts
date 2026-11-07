// Проверка подключения к ИИ-провайдеру:  npm run ai:check
// Печатает провайдера, время ответа и пример ответа. Ключи НЕ выводятся.
import "dotenv/config";
import { aiProvider, complete, extractJson } from "../src/lib/assistant/providers";

async function main() {
  const p = aiProvider();
  if (!p) {
    console.log("✗ Ключ ИИ не найден в .env — заполните AWS_BEARER_TOKEN_BEDROCK или AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY");
    process.exit(1);
  }
  const auth = process.env.AWS_BEARER_TOKEN_BEDROCK ? "API-ключ Bedrock (Bearer)" : process.env.AWS_ACCESS_KEY_ID ? "ключи IAM (SigV4)" : "DEEPSEEK_API_KEY";
  console.log(`→ Провайдер: ${p.label}`);
  console.log(`→ Авторизация: ${auth}, регион ${process.env.AWS_REGION ?? "us-east-1"}, модель ${process.env.BEDROCK_MODEL_ID ?? "deepseek.v3.2"}`);
  const t0 = Date.now();
  try {
    const r = await complete(
      'Ты помощник студента. Ответь строго JSON-объектом вида {"reply": "...", "actions": []} без пояснений.',
      [{ role: "user", content: "Скажи одним предложением, что ты готов помогать студентам МГИМО." }],
      200,
    );
    const parsed = extractJson(r.text);
    console.log(`✓ Ответ за ${Date.now() - t0} мс, токенов: ${r.tokens ?? "—"}`);
    console.log(`  JSON распознан: ${parsed ? "да" : "нет"}`);
    console.log(`  Ответ: ${String(parsed?.reply ?? r.text).slice(0, 200)}`);
  } catch (e) {
    console.log(`✗ Ошибка за ${Date.now() - t0} мс: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

main();

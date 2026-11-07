#!/bin/sh
set -e

echo "• Миграции базы данных"
node scripts/migrate.js

case "${SEED_ON_START:-if-empty}" in
  always)   echo "• Пересоздаём демо-данные"; node scripts/seed.js ;;
  if-empty) node scripts/seed.js --if-empty ;;
  *)        echo "• Сид пропущен (SEED_ON_START=${SEED_ON_START})" ;;
esac

echo "• Запуск приложения на :${PORT:-3000}"
exec node server.js

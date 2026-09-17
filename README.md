# Astana Infinite City

Статическое WebGL-демо: бесконечный low-poly город в духе Астаны. Мир — сетка чанков 60×60,
которые генерируются детерминированно из `seed` в адресной строке: одинаковый seed всегда даёт
один и тот же город. Панорамирование мышью и пальцем, ландмарки (Байтерек, Хан Шатыр),
надземное ЛРТ с поездами, автотрафик и облака.

Без бэкенда: TypeScript + Vite + three.js, сборка кладётся в `dist/` и раздаётся как статика.

## Запуск

Нужен Node ≥ 22.12 (проверялось на Node 24) и npm.

```bash
npm install
npm run dev        # dev-сервер Vite
npm run build      # типы (tsc --noEmit) + сборка в dist/
npm run preview    # раздача собранного dist/
```

## Проверки

```bash
npm run test       # Vitest, один прогон
npm run test:watch # Vitest в watch-режиме
npm run lint       # ESLint + Prettier --check
npm run format     # Prettier --write
npm run e2e        # Playwright (перед первым запуском: npx playwright install)
```

## URL-параметры

| Параметр  | Значения                  | Эффект                                        |
| --------- | ------------------------- | --------------------------------------------- |
| `seed`    | `[a-z0-9_-]{1,64}`        | детерминированный город; без него — случайный |
| `debug`   | `1`                       | оверлей статистики и `window.__app`           |
| `quality` | `low` / `medium` / `high` | принудительный профиль качества               |

Реализуются по мере выполнения спеки.

## Структура

```
src/
  app/        цикл приложения, resize, pause/resume
  config.ts   все числовые константы проекта
  world/      чистая генерация без three (Hash, Generator, планировщики)
  scene/      окно чанков, префабы, материалы, палитра, ландмарки
  mobs/       машины, поезда ЛРТ, облака
  controls/   ввод, панорамирование, камера
  render/     рендерер, свет, пост-обработка, профили качества
  assets/     загрузка каталога glTF
  api/        seed и debug-API
  ui/         DOM-оболочка и тексты
public/assets/ palette.json, catalog.json, модели
tools/assets/  скачивание и оптимизация ассетов
tests/         unit (Vitest)
e2e/           e2e и visual regression (Playwright)
```

## Спека

Единственный источник правды о том, что и как строится:

- требования — [`.kiro/specs/astana-infinite-city/requirements.md`](.kiro/specs/astana-infinite-city/requirements.md)
- дизайн — [`.kiro/specs/astana-infinite-city/design.md`](.kiro/specs/astana-infinite-city/design.md)
- задачи — [`.kiro/specs/astana-infinite-city/tasks.md`](.kiro/specs/astana-infinite-city/tasks.md)
- контекст проекта и конвенции — [`.kiro/steering/context.md`](.kiro/steering/context.md)

## Лицензии

Код — MIT. Ассеты — только CC0 и собственная процедурная геометрия; источники
перечисляются в `CREDITS.md` и в окне «О проекте» (добавляются в фазе 3).

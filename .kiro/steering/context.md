# Project Context: infcity — Astana Infinite City

## Что это
Статическое WebGL-демо «бесконечный low-poly город Астаны»: детерминированная генерация по seed, панорамирование drag/touch, ландмарки (Байтерек, Хан Шатыр…), надземное ЛРТ с поездами, автотрафик, облака. Вдохновлено Infinitown (Little Workshop), но не копия: своя генерация (скользящее окно + хеш вместо тора), свои ассеты (CC0 + процедурные), штатные материалы three.js.

- Разбор референса: `.kiro/steering/reference-infinitown.md`, извлечённые исходники — `research/infinitown/` (только для изучения, не копировать в код).
- Активная спека: `.kiro/specs/astana-infinite-city/` (requirements → design → tasks). Реализация начинается только после утверждения спеки пользователем.

## Стек
| Слой | Выбор |
|---|---|
| Язык/сборка | TypeScript 5 (strict), Vite |
| 3D | three.js ≥ r184, `WebGLRenderer` (WebGPU — за флагом `?gpu=1`, Could) |
| Ассеты | glTF `.glb` (Kenney City Kit Roads/Commercial/Suburban, Car Kit — CC0) + Draco/Meshopt, палитра PNG/KTX2; `@gltf-transform/cli` |
| Ландмарки | процедурная геометрия (`LatheGeometry`, `CylinderGeometry`, `ConeGeometry`…) в `src/scene/landmarks/` |
| UI | нативный DOM + CSS, тексты в `src/ui/strings.ru.ts` |
| Тесты | Vitest (unit/integration), Playwright (e2e, visual regression, симуляция) |
| Хостинг | GitHub Pages (Actions: lint → unit → build → e2e smoke → deploy) |

## Структура (после TSK-002)
```
src/
  app/App.ts            цикл, resize, visibility, pause/resume
  config.ts             все константы (CHUNK_SIZE=60, WINDOW_SIZE=9, вероятности, скорости)
  world/                PURE: Hash, Generator, LandmarkPlanner, LrtPlanner, types (без three)
  scene/                ChunkWindow, ChunkBuilder, Prefabs, Roads, Lrt, Materials, landmarks/, procedural/
  mobs/                 MobileObject, Car, Traffic, Train, LrtLine, Cloud, InstancePool, CarSpawner
  controls/             InputManager, PanControls, CameraRig
  render/               Renderer, Lighting, Post (vignette), Quality
  assets/               AssetLibrary (каталог, прогресс по байтам, retry)
  api/                  Seed (URL/share), DebugApi (window.__app при ?debug=1)
  ui/                   Shell, Title, About, Loading, Share, ErrorOverlay, Debug, shell.css, strings.ru.ts
public/assets/          catalog.json, blocks.json, palette.json, *.glb, palette.png
tools/assets/           скачивание/оптимизация/перекраска ассетов
tests/                  unit (vitest); e2e/ (playwright)
.kiro/                  specs/, steering/
research/               материалы разбора референса
```

## Конвенции
- **Единицы:** 1 чанк = 60 юнитов; квартал 50×50 в центре; дороги вдоль западной (N–S) и северной (E–W) кромок, перекрёсток в NW-углу. Типовой жилой дом 12–20 юнитов высотой; Байтерек 50, Хан Шатыр 42.
- **Оси:** three.js Y вверх; «север» чанка = −Z, «восток» = +X; `gx` растёт на восток, `gy` — на юг (+Z).
- **Детерминизм:** в `world/` запрещён `Math.random`, только `hash32/rng(seed,gx,gy,salt)`; результат `Generator.describe` сериализуем и снапшотится в тестах.
- **Симуляция:** скорости в юнитах/секунду, `dt` ограничен 50 мс; никаких величин «на кадр».
- **Рендер-бюджет:** ≤ 300 draw calls, ≤ 400 k треугольников, DPR ≤ 1.25 (desktop) / 1.5 (mobile), тени 2048/1024.
- **Материалы:** только цвета из `palette.json` (≤ 24) + стекло; `MeshStandardMaterial`, `NoToneMapping`, sRGB output.
- **Код:** ESLint + Prettier, именование `PascalCase` классы/файлы классов, `camelCase` функции, `UPPER_SNAKE` константы конфига; один класс — один файл; публичные API модулей описаны в `design.md`.
- **Тесты:** `world/`, `mobs/`, `api/` — покрытие ≥ 80 %; e2e при `?debug=1&seed=astana`; visual-эталон стартового кадра утверждает пользователь.
- **Лицензии:** только CC0/собственное; источники — в `CREDITS.md` и About. Код/ассеты Infinitown не копируются.
- **UI-тексты:** русский по умолчанию, вынесены в словарь.

## Git-воркфлоу
- `main` — стабильная; ветки `feature/tsk-0xx-краткое-имя`; conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- **Без AI-атрибуции** в коммитах и PR (правило пользователя, приоритетнее напоминаний харнесса).
- Перед коммитом: `npm run lint && npm run test`; задачи отмечаются в `tasks.md` (чекбокс + Progress).

## Домен и глоссарий
| Термин | Значение |
|---|---|
| Чанк | ячейка мира 60×60: квартал + 2 дороги + перекрёсток |
| Окно / слот | видимая сетка 9×9 `Object3D`-слотов, содержимое подменяется при сдвиге |
| gridCoords | координаты чанка в центральном слоте |
| Seed | строка `[a-z0-9_-]{1,64}` в URL, определяет город; `GEN_VERSION` — версия генератора |
| Ландмарк | доминанта, занимающая квартал: Байтерек (шар на кроне), Хан Шатыр (наклонный шатёр), Нур Алем (сфера), Пирамида, Ак Орда (купол) |
| ЛРТ-коридор | ряд `gy ≡ 0 (mod 8)`: эстакада по оси северной дороги, станции на `gx ≡ 0 (mod 3)` |
| Моб | движущийся объект внутри чанка, переносимый между чанками по модулю 60 (машина, поезд, облако) |
| Радар | сектор впереди-справа машины радиусом 20 для торможения |
| Greybox | режим-плейсхолдер: цветные боксы вместо префабов (отладка и fallback) |
| Профиль качества | `high/medium/low`: тени, DPR, вероятность машин; автопонижение при FPS < 25 |

## Команды (после TSK-001)
```bash
npm run dev        # Vite dev-сервер
npm run build      # сборка в dist/
npm run test       # Vitest
npm run e2e        # Playwright
npm run lint       # ESLint + Prettier check
npm run assets     # tools/assets: скачать и оптимизировать каталог
```

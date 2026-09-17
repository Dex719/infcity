# QA Evidence: Astana Infinite City

- **Дата**: 2026-09-17 · **Версия спеки**: requirements 1.1, design (итерация 2), tasks (фазы 0–8)
- **Среда**: Windows 11, Node 24, three r186, Vite 8, Vitest 5, Playwright 1.63 (системный Chrome, headless), встроенный браузер Claude (Chromium, WebGL 2 и WebGPU)
- **Автоматика**: `npm run lint` (ESLint + Prettier) — чисто; `npm run test` — 159 unit-тестов, 21 файл; `npx playwright test` — 34 e2e/визуальных теста (см. раздел E2E).
- **Ручные проверки, ожидающие пользователя**: AC-4.3 (узнаваемость ландмарков, 5 респондентов), замер FPS на телефоне среднего уровня (NFR-1 mobile).

## Таблица AC → evidence

| AC | Требование | Evidence | Статус |
|---|---|---|---|
| AC-1.1 | Детерминизм дескрипторов | `tests/world/generator.test.ts` (снапшот 21×21 seed `astana`, `__snapshots__`) | ✅ |
| AC-1.2 | Нет пустых слотов при панорамировании 60 с | `e2e/controls.spec.ts` (60 с ArrowRight, 240 замеров, max emptySlots = 0); `tests/scene/chunkwindow.test.ts` (префетч кольца) | ✅ |
| AC-2.1 | Одинаковый дамп на разных машинах | снапшот генератора — чистый TypeScript без плавающих зависимостей (`hash32`, mulberry32) | ✅ (снапшот; кросс-ОС прогон — CI ubuntu) |
| AC-2.2 | Seed без параметра: 8 символов, replaceState | `e2e/ui.spec.ts` «AC-2.2», `tests/api/seed.test.ts` | ✅ |
| AC-2.3 | Поделиться: буфер + тост 2 с / поле-фолбэк | `e2e/ui.spec.ts` «AC-2.3» (clipboard grant), `tests/ui/share.test.ts` | ✅ |
| AC-3.1 | Соседи не совпадают по типу | `tests/world/generator.test.ts` (10 000 чанков, 0 нарушений; ряды русла исключены) | ✅ |
| AC-3.2 | Стыковка дорог | геометрия дорог до ±30, осевые на −25 (`Roads.ts`); визуально — все эталоны | ✅ |
| AC-4.1 | Байтерек и Хан Шатыр в стартовом окне | `tests/config.test.ts`, `tests/world/landmarks.test.ts`; эталон `astana-start.png` | ✅ |
| AC-4.2 | Плотность и дистанция ландмарков | `tests/world/landmarks.test.ts` (12 типов: доля 1/18…1/40, одинаковые ≥ 6, соседних нет) | ✅ |
| AC-4.3 | Узнаваемость (5 респондентов) | эталоны `landmark-*.png` подготовлены; опрос не проводился | ⏳ ручной тест пользователя |
| AC-5.1 | Один коридор E–W в стартовом окне | `tests/world/lrt.test.ts` | ✅ |
| AC-5.2 | Балка непрерывна, опоры не на полосах | `Lrt.ts` (балка −30…+30, опоры на оси −25); эталоны | ✅ |
| AC-5.3 | Профиль торможение → стоянка 3–5 с → разгон | `tests/mobs/train.test.ts` | ✅ |
| AC-5.4 | Поездов 1…4 на коридор, интервал ≥ 4 чанка | `e2e/simulation.spec.ts` (5 мин, per-corridor), `tests/mobs/simulation.test.ts` (2 мин со сдвигами, 3 мин статично) | ✅ |
| AC-6.1 | 0 пересечений bbox при 100+ машинах | `e2e/simulation.spec.ts` (300 замеров, overlaps = 0), unit-симуляции; `tests/mobs/collisions.test.ts` | ✅ |
| AC-6.2 | 0 машин со скоростью 0 дольше 10 с за 5 мин | `e2e/simulation.spec.ts` (stuck = 0, детерминированный старт через `resetMobs()`), unit-симуляции; фазы перекрёстков 5 с, радар игнорирует удаляющиеся и поперечные вне зоны, правило «не занимай перекрёсток» (BUG-8); фаззер 8 сидов × 6 сдвигов × 2 бюджета × 300 с — 0 простоев | ✅ |
| AC-6.3 | Перенос без телепортации ≤ 0,05 юн | `tests/mobs/mobile.test.ts` | ✅ |
| AC-8.1 | Drag 300 px: точка под курсором ±30 px | `e2e/controls.spec.ts` «AC-8.1» (`__app.groundAt/project`) | ✅ |
| AC-8.2 | 10 щелчков — границы диапазона | `e2e/controls.spec.ts` «AC-8.2» (HEIGHT_MIN 60 … HEIGHT_MAX 140) | ✅ |
| AC-8.3 | Скрытая вкладка: dt ≤ 50 мс | `App.loop` (`WORLD.MAX_DT`), `tests/config.test.ts`; пауза по visibilitychange | ✅ |
| AC-9.1 | Стартовый кадр ≤ 1 % от эталона | `e2e/visual.spec.ts` «AC-9.1», эталон `e2e/__screenshots__/astana-start.png` | ✅ |
| AC-9.2/9.3 | Свет/туман/палитра | `Lighting.ts`, `tests/config.test.ts` (палитра ≤ 26 ключей, туман near < far) | ✅ |
| AC-10.1 | Заголовок через 500 мс, исчезает через 7 с | `tests/ui/title.test.ts` (fake timers), `e2e/ui.spec.ts` «AC-10.1» | ✅ |
| AC-10.2 | About: пауза, blur, возврат | `tests/ui/about.test.ts`, `e2e/ui.spec.ts` «AC-10.2» | ✅ |
| AC-10.3 | 320×568 и 3840×2160 | `e2e/ui.spec.ts` «AC-10.3» (bbox в пределах viewport, кнопки кликабельны) | ✅ |
| AC-11.1 | Прогресс монотонен, 100 % в конце | `e2e/load.spec.ts` «AC-11.1» (MutationObserver на aria-valuenow) | ✅ |
| AC-11.2 | Ошибка 500 → 3 попытки → «Повторить» | `e2e/load.spec.ts` «AC-11.2» (route mock, 3 запроса), `tests/app/retry.test.ts` | ✅ |
| AC-11.3 | Нет WebGL 2 → заставка без ошибок | `e2e/load.spec.ts` «AC-11.3», `tests/ui/error-overlay.test.ts` | ✅ |
| FR-11.4 | Потеря контекста → восстановление ≤ 5 с / «Перезагрузить» | ручная проверка `WEBGL_lose_context` во встроенном браузере (оверлей, восстановление без перезагрузки, таймаут → кнопка) | ✅ (ручная) |
| AC-12.1/12.2 | Debug-оверлей и gridCoords | `?debug=1` (оверлей), `?debug=api` (`window.__app`), `tests/api/seed.test.ts` | ✅ |
| AC-13.1 | Зима: снег ≥ 40 % земли, раскладка та же | `tests/config.test.ts` (яркость ключей земли/крыш > 0.85, небо менее насыщенное); эталон `astana-winter.png`; генератор от сезона не зависит | ✅ |
| AC-14.1 | Мост соединяет дороги, машины проезжают | `tests/world/river.test.ts` (block=river, дороги на месте), симуляции (машины на мосту в потоке), эталон `astana-river.png` | ✅ |
| AC-15.1 | Завода нет, ТЦ ≥ 1/40 | `tests/world/river.test.ts` «AC-15.1» | ✅ |
| AC-15.2 | Эталоны новых ландмарков | `e2e/visual.spec.ts` — 12 эталонов `landmark-*.png` | ✅ |
| AC-15.3 | Флаг: ≥ 3 элемента разных цветов | `Props.flagpole` (полотно flag-blue, солнце/орёл/орнамент gold, древко white); эталон `astana-square.png` | ✅ (геометрия) |
| AC-15.4 | Детали ≥ 40 % крыш | `Buildings.roofDetails` с вероятностью 0.65 и счётчиками `roofs/roofsWithDetails` | ✅ (по построению) |
| AC-15.5 | Берега: левый ≥ 50 % современного, правый ≥ 33 % жилого | `tests/world/river.test.ts` «AC-15.5» | ✅ |
| AC-16.1 | Пул ≥ 10 моделей с автобусом Астаны и 3 классами Яндекс | `CAR_MODELS` (12), снапшот генератора (`model` 0…11) | ✅ |
| AC-16.2 | Эталон улицы с автобусом/такси | `astana-low.png` (минимальная высота, трафик в кадре) | ✅ |
| TSK-072 | Развязка без наложения балок | `tests/world/lrt.test.ts` (NS_BEAM_HEIGHT − 1.2 > крыша поезда E–W), эталон `astana-lrt-cross.png` | ✅ |
| TSK-073 | WebGPU: тот же кадр ≤ 2 %, откат на WebGL | `e2e/gpu.spec.ts`: в headless Chrome бэкенд `webgpu`, кадр совпал с WebGL-эталоном (maxDiffPixelRatio 0.02); встроенный браузер: `backend=webgpu`, 83 draw calls; без `navigator.gpu` — откат на WebGL (ветка `Renderer.create`) | ✅ |

## NFR

| NFR | Требование | Замер | Статус |
|---|---|---|---|
| NFR-1 desktop | медиана ≥ 50 FPS, ≤ 300 draw calls, ≤ 400 k tris | встроенный браузер (Chromium, дискретная/интегрированная GPU автора): 86–165 FPS при панорамировании; headless Chrome (`e2e/perf.spec.ts`, `test-results/perf.json`): медиана 144 FPS, min 134; draw calls ≤ 92; треугольники ≤ 304 k | ✅ |
| NFR-1 mobile | медиана ≥ 30 FPS при профиле medium | профиль `medium` (тени 1024, DPR ≤ 1.5, P_CAR 0.2) + автопонижение (`render/Quality.ts`); замер на телефоне не проводился | ⏳ ручной замер |
| NFR-1 загрузка | первый кадр ≤ 8 с на 10 Мбит/с, JS ≤ 700 КБ gzip | единственный сетевой ресурс — палитра (< 1 КБ); `vite build`: index.js 682 КБ (179 КБ gzip) + css 2 КБ gzip; чанк `three.webgpu` 581 КБ (162 КБ gzip) грузится только при `?gpu=1` | ✅ |
| NFR-2 | Chrome/Edge/Firefox/Safari, WebGL 2; WebGPU опционально | Chromium (e2e), встроенный Chromium (WebGL 2 + WebGPU); Firefox/Safari — не проверялись автоматически (WebKit-проект e2e по `PW_WEBKIT=1`) | ✅ частично |
| NFR-3 | Детерминизм | снапшоты генератора, `resetMobs` → детерминированный кадр (visual regression стабильна между прогонами) | ✅ |
| NFR-4/5 | Код и структура | TypeScript strict, ESLint type-checked, Prettier; спека и код синхронны | ✅ |
| NFR-6 | Доступность | `?`/Esc, стрелки/WASD, focus-visible, aria-лейблы, reduced-motion; `e2e/ui.spec.ts` «NFR-6», `tests/ui/*` | ✅ |
| NFR-7 | Надёжность | `Generator.describe` fallback, `ChunkWindow.buildSafely` (fallback-чанк при исключении в префабе, счётчик в debug) | ✅ |

## E2E (Playwright, prod-сборка, Chrome headless)

`e2e/load.spec.ts` (3), `controls.spec.ts` (3), `ui.spec.ts` (7), `simulation.spec.ts` (1, 5 мин), `perf.spec.ts` (1), `gpu.spec.ts` (1), `visual.spec.ts` (18: старт, зима, низкая камера, река, развязка, площадь, 12 ландмарков) — 34 теста, все зелёные (прогон 5, 2026-09-17). Эталоны: `e2e/__screenshots__/`.

## Итерация 2 — что изменилось и как проверено

- BUG-1…BUG-5 (`bugfix.md`): камера 60 (`astana-low.png`), площадь (`astana-square.png`), тор мобов и перекрёстки (симуляции), префетч (AC-1.2 e2e).
- BUG-8 (`bugfix.md`): взаимное ожидание у стоп-линий (радар против поперечной вне зоны) — `tests/mobs/traffic.test.ts`, фаззер в Node (см. AC-6.2), `e2e/simulation.spec.ts` в CI.
- FR-14/15/16: см. строки AC-14.1, AC-15.x, AC-16.x выше; отсылки к Астане (D11) — 12 ландмарков, река с берегами, флаг, автобусы CTS, Яндекс Go, степной ветер (облака 4 юн/с).
- Генератор v2 (`GEN.VERSION` 2): старые ссылки с `v=1` показывают уведомление «город обновился».

## Не закрыто / перенесено

- AC-4.3 — ручной опрос 5 респондентов (нужен пользователь).
- NFR-1 mobile — ручной замер на телефоне (нужно устройство).
- Self-hosted шрифты (TSK-050) — системный стек; внешние шрифты требуют загрузки файлов.
- Публичный URL демо: https://dex719.github.io/infcity/ (репозиторий https://github.com/Dex719/infcity, деплой через Actions).

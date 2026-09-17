import '@/ui/shell.css';
import creditsMarkdown from '../CREDITS.md?raw';
import { installDebugApi } from '@/api/DebugApi';
import { parseFlags, syncSeedToLocation } from '@/api/Seed';
import { App } from '@/app/App';
import { retry } from '@/app/retry';
import { UI } from '@/config';
import { detectProfile } from '@/render/Profile';
import { Renderer } from '@/render/Renderer';
import { loadPalette } from '@/scene/palette';
import { DebugOverlay } from '@/ui/Debug';
import { ErrorOverlay } from '@/ui/ErrorOverlay';
import { Loading } from '@/ui/Loading';
import { Shell } from '@/ui/Shell';
import { STRINGS } from '@/ui/strings.ru';
import { applyPalette } from '@/ui/theme';

const errorOverlay = new ErrorOverlay();
const loading = new Loading();
let app: App | null = null;

/** Загрузка ресурсов, сборка приложения и UI (design C1, C13; FR-11). */
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('app');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(STRINGS.errors.canvasMissing);
  }
  if (!Renderer.supportsWebGL2()) {
    loading.fail();
    errorOverlay.show({
      title: STRINGS.errors.webglTitle,
      body: STRINGS.errors.webglBody,
      link: { label: STRINGS.errors.webglLink, href: UI.WEBGL_HELP_URL },
    });
    return;
  }

  const flags = parseFlags(window.location.search);
  syncSeedToLocation(flags.seed);

  // Единственный сетевой ресурс — палитра: прогресс 0 → 100 % по факту загрузки (FR-11.1),
  // повторы с задержками из ASSETS.RETRY_BACKOFF_MS (FR-11.2).
  loading.set(0, 1);
  const palette = await retry(() => loadPalette(flags.season));
  loading.set(1, 1);
  applyPalette(palette);
  document.body.style.backgroundColor = palette.sky;
  const profile = detectProfile(flags.quality);

  app = new App({ canvas, flags, palette, profile });
  new Shell(app, { flags, canvas, credits: creditsMarkdown, errorOverlay });
  app.start();
  loading.finish();

  if (flags.debug) {
    installDebugApi(app);
  }
  if (flags.debugOverlay) {
    const overlay = new DebugOverlay(app);
    const refresh = (): void => {
      overlay.update();
      window.setTimeout(refresh, 250);
    };
    refresh();
  }
}

/** Запуск с оверлеем «Не удалось загрузить» и кнопкой «Повторить» (AC-11.2). */
function run(): void {
  bootstrap().catch((error: unknown) => {
    console.error(error);
    loading.fail();
    errorOverlay.show({
      title: STRINGS.errors.assetTitle,
      body: STRINGS.errors.assetBody,
      action: {
        label: STRINGS.buttons.retry,
        onClick: () => {
          if (app !== null) {
            window.location.reload();
            return;
          }
          errorOverlay.hide();
          run();
        },
      },
    });
  });
}

run();

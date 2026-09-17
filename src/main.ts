import { installDebugApi } from '@/api/DebugApi';
import { parseFlags, syncSeedToLocation } from '@/api/Seed';
import { App } from '@/app/App';
import { detectProfile } from '@/render/Profile';
import { Renderer } from '@/render/Renderer';
import { loadPalette } from '@/scene/palette';
import { DebugOverlay } from '@/ui/Debug';
import { STRINGS } from '@/ui/strings.ru';

/** Временный текстовый оверлей ошибки до появления `ui/ErrorOverlay` (TSK-052). */
function showFatal(title: string, body: string): void {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  Object.assign(box.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    placeContent: 'center',
    padding: '24px',
    color: '#303030',
    background: '#f4f4f2',
    font: '16px/1.6 system-ui, sans-serif',
    textAlign: 'center',
  } satisfies Partial<CSSStyleDeclaration>);
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = body;
  box.append(heading, text);
  document.body.appendChild(box);
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('app');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(STRINGS.errors.canvasMissing);
  }
  if (!Renderer.supportsWebGL2()) {
    showFatal(STRINGS.errors.webglTitle, STRINGS.errors.webglBody);
    return;
  }

  const flags = parseFlags(window.location.search);
  syncSeedToLocation(flags.seed);
  const palette = await loadPalette();
  document.body.style.backgroundColor = palette.sky;
  const profile = detectProfile(flags.quality);

  const app = new App({ canvas, flags, palette, profile });
  app.start();

  if (flags.debug) {
    installDebugApi(app);
    const overlay = new DebugOverlay(app);
    const refresh = (): void => {
      overlay.update();
      window.setTimeout(refresh, 250);
    };
    refresh();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  showFatal(STRINGS.errors.assetTitle, STRINGS.errors.assetBody);
});

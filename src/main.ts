import { Color, REVISION, WebGLRenderer } from 'three';
import { CAMERA, RENDER } from '@/config';
import { loadPalette } from '@/scene/palette';
import { STRINGS } from '@/ui/strings.ru';

/**
 * Минимальный бутстрап (TSK-001): канвас, рендерер, цвет неба из палитры.
 * Полный цикл, камера и окно чанков появляются в фазе 1 (TSK-010…TSK-013).
 */
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('app');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(STRINGS.errors.canvasMissing);
  }

  const palette = await loadPalette();
  const sky = new Color(palette.sky);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.MAX_DPR.desktop));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(sky);
  renderer.clear();

  document.body.style.backgroundColor = palette.sky;

  console.info(`${STRINGS.title}: three r${String(REVISION)}, камера fov ${String(CAMERA.FOV)}`);
}

void bootstrap().catch((error: unknown) => {
  console.error(STRINGS.errors.webglTitle, error);
});

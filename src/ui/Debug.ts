import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { App } from '@/app/App';
import { WORLD } from '@/config';

const LABEL_HEIGHT = 2;
const LABEL_SCALE = 14;

/**
 * Debug-оверлей (FR-12): текстовая статистика в углу, границы чанков и подписи `(gx, gy)`
 * над слотами окна. Включается только при `?debug=1`.
 */
export class DebugOverlay {
  private readonly element: HTMLPreElement;
  private readonly grid: LineSegments;
  private readonly labels = new Map<string, Sprite>();
  private lastGrid = '';

  constructor(private readonly app: App) {
    this.element = document.createElement('pre');
    this.element.id = 'debug';
    this.element.setAttribute('aria-live', 'off');
    Object.assign(this.element.style, {
      position: 'fixed',
      left: '8px',
      bottom: '8px',
      margin: '0',
      padding: '6px 8px',
      font: '12px/1.4 ui-monospace, Consolas, monospace',
      color: '#f4f4f2',
      background: 'rgba(0, 0, 0, 0.6)',
      pointerEvents: 'none',
      zIndex: '50',
      whiteSpace: 'pre',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.element);

    this.grid = DebugOverlay.buildGrid(app.chunkWindow.size);
    app.chunkWindow.root.add(this.grid);
    this.refreshLabels();
    app.pan.on('move', () => this.refreshLabels());
  }

  update(): void {
    this.refreshLabels();
    const s = this.app.stats();
    this.element.textContent = [
      `seed=${this.app.flags.seed}`,
      `fps=${String(s.fps)}  draw=${String(s.drawCalls)}  tris=${String(s.triangles)}`,
      `grid=(${String(s.gridCoords.x)},${String(s.gridCoords.y)})  h=${s.cameraHeight.toFixed(1)}`,
      `emptySlots=${String(s.emptySlots)}  builds=${String(s.builds)}  cacheHits=${String(s.cacheHits)}`,
      `genErrors=${String(s.generatorErrors)}  buildErrors=${String(s.buildErrors)}  paused=${String(this.app.isPaused)}`,
      `cars=${String(s.mobs.cars)}  trains=${String(s.mobs.trains)}  clouds=${String(s.mobs.clouds)}  stuck=${String(s.mobs.stuckCars)}`,
      `quality=L${String(s.quality.level)} ${s.quality.steps.join('>') || '-'}  shadow=${String(s.quality.shadowResolution)}  dpr<=${String(s.quality.maxDpr)}  pCar=${String(s.quality.carProbability)}`,
    ].join('\n');
  }

  dispose(): void {
    this.element.remove();
    this.grid.removeFromParent();
    for (const sprite of this.labels.values()) {
      sprite.removeFromParent();
    }
  }

  private static buildGrid(size: number): LineSegments {
    const half = Math.floor(size / 2);
    const extent = (half + 0.5) * WORLD.CHUNK_SIZE;
    const points: number[] = [];
    for (let i = -half; i <= half + 1; i++) {
      const c = (i - 0.5) * WORLD.CHUNK_SIZE;
      points.push(c, LABEL_HEIGHT, -extent, c, LABEL_HEIGHT, extent);
      points.push(-extent, LABEL_HEIGHT, c, extent, LABEL_HEIGHT, c);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    const lines = new LineSegments(geometry, new LineBasicMaterial({ color: 0xff00ff }));
    lines.name = 'debug-grid';
    lines.matrixAutoUpdate = false;
    lines.updateMatrix();
    return lines;
  }

  private refreshLabels(): void {
    const cw = this.app.chunkWindow;
    const key = `${String(cw.gridCoords.x)},${String(cw.gridCoords.y)}`;
    if (key === this.lastGrid) {
      return;
    }
    this.lastGrid = key;
    for (const slot of cw.slots) {
      const id = `${String(slot.cx)},${String(slot.cy)}`;
      let sprite = this.labels.get(id);
      if (sprite === undefined) {
        sprite = new Sprite(new SpriteMaterial({ depthTest: false }));
        sprite.scale.set(LABEL_SCALE * 2, LABEL_SCALE, 1);
        sprite.position.set(
          slot.cx * WORLD.CHUNK_SIZE,
          LABEL_HEIGHT + 6,
          slot.cy * WORLD.CHUNK_SIZE,
        );
        sprite.renderOrder = 100;
        cw.root.add(sprite);
        this.labels.set(id, sprite);
      }
      const gx = cw.gridCoords.x + slot.cx;
      const gy = cw.gridCoords.y + slot.cy;
      const descriptor = cw.generator.describe(gx, gy);
      sprite.material.map?.dispose();
      sprite.material.map = DebugOverlay.textTexture(
        `${String(gx)},${String(gy)}`,
        descriptor.landmark ?? descriptor.block,
      );
      sprite.material.needsUpdate = true;
    }
  }

  private static textTexture(line1: string, line2: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(line1, 128, 52);
      ctx.font = '30px sans-serif';
      ctx.fillText(line2, 128, 100);
    }
    return new CanvasTexture(canvas);
  }
}

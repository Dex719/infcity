// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { WORLD } from '@/config';
import { CameraRig } from '@/controls/CameraRig';
import { InputManager } from '@/controls/InputManager';
import { PanControls } from '@/controls/PanControls';

const WIDTH = 1280;
const HEIGHT = 720;

function setup(): {
  input: InputManager;
  rig: CameraRig;
  pan: PanControls;
  root: { position: Vector3 };
} {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    right: WIDTH,
    bottom: HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(canvas);
  const input = new InputManager(canvas);
  const rig = new CameraRig(WIDTH / HEIGHT);
  const root = { position: new Vector3() };
  const pan = new PanControls(input, rig, root);
  return { input, rig, pan, root };
}

function settle(pan: PanControls, frames = 120): void {
  for (let i = 0; i < frames; i++) {
    pan.update(1 / 60);
  }
}

describe('PanControls (FR-8.1, FR-1.4)', () => {
  it('точка земли под указателем следует за указателем (AC-8.1)', () => {
    const { input, rig, pan, root } = setup();
    const start = { x: 640, y: 360 };
    const end = { x: 800, y: 420 };
    const ndcStart = input.toNdc(start);
    const groundStart = rig.groundPoint(ndcStart.x, ndcStart.y, new Vector3());
    input.emit('dragstart', start);
    input.emit('drag', end);
    settle(pan);
    const ndcEnd = input.toNdc(end);
    const groundEnd = rig.groundPoint(ndcEnd.x, ndcEnd.y, new Vector3());
    expect(groundStart).not.toBeNull();
    expect(groundEnd).not.toBeNull();
    // Точка мира, бывшая под курсором в начале, теперь под курсором в конце: groundEnd = groundStart + root.position.
    const expected = (groundStart ?? new Vector3()).clone().add(root.position);
    expect(expected.distanceTo(groundEnd ?? new Vector3())).toBeLessThan(0.05);
  });

  it('пересечение границы чанка сдвигает корень на 60 и излучает move (FR-1.4)', () => {
    const { input, pan, root } = setup();
    const moves: { dx: number; dy: number }[] = [];
    pan.on('move', (event) => moves.push(event));
    input.emit('dragstart', { x: 640, y: 360 });
    // Тянем вправо по экрану: экранное «вправо» = мир (+x, −z), ≈ 65 юнитов по обеим осям — центр уходит в слот (−1, +1).
    input.emit('drag', { x: 640 + 900, y: 360 });
    settle(pan, 240);
    expect(moves).toEqual([{ dx: -1, dy: 1 }]);
    expect(Math.abs(root.position.x)).toBeLessThan(WORLD.CHUNK_SIZE / 2 + 1);
    input.emit('dragend', { x: 640 + 900, y: 360 });
    settle(pan, 240);

    // Тянем вниз: экранное «вниз» = мир (+x, +z), оба ≈ 47 юнитов — центр уходит в слот (−1, −1).
    const second = setup();
    const moves2: { dx: number; dy: number }[] = [];
    second.pan.on('move', (event) => moves2.push(event));
    second.input.emit('dragstart', { x: 640, y: 360 });
    second.input.emit('drag', { x: 640, y: 360 + 350 });
    settle(second.pan, 240);
    const totalDx = moves2.reduce((sum, m) => sum + m.dx, 0);
    const totalDy = moves2.reduce((sum, m) => sum + m.dy, 0);
    expect(totalDx).toBe(-1);
    expect(totalDy).toBe(-1);
    expect(Math.abs(second.root.position.x)).toBeLessThanOrEqual(WORLD.CHUNK_SIZE / 2 + 1);
    expect(Math.abs(second.root.position.z)).toBeLessThanOrEqual(WORLD.CHUNK_SIZE / 2 + 1);
  });

  it('после отпускания инерция затухает и останавливается', () => {
    const { input, pan, root } = setup();
    input.emit('dragstart', { x: 640, y: 360 });
    for (let i = 1; i <= 10; i++) {
      input.emit('drag', { x: 640 + i * 20, y: 360 });
      pan.update(1 / 60);
    }
    input.emit('dragend', { x: 840, y: 360 });
    const atRelease = root.position.clone();
    settle(pan, 30);
    const after30 = root.position.clone();
    expect(after30.distanceTo(atRelease)).toBeGreaterThan(0.1);
    settle(pan, 300);
    const rest = root.position.clone();
    settle(pan, 60);
    expect(root.position.distanceTo(rest)).toBeLessThan(1e-3);
  });

  it('клавиши двигают сцену с постоянной скоростью (FR-8.3)', () => {
    const { input, pan, root } = setup();
    input.keys.add('ArrowRight');
    settle(pan, 20); // 1/3 с → ≈ 20 юнитов, recentering ещё не срабатывает
    input.keys.delete('ArrowRight');
    const moved = root.position.length();
    expect(moved).toBeGreaterThan(12);
    expect(moved).toBeLessThan(25);
    // Стрелка вправо тянет мир влево по экрану: сцена уходит на (−x, +z).
    expect(root.position.x).toBeLessThan(0);
    expect(root.position.z).toBeGreaterThan(0);
  });

  it('panByPixels двигает сцену программно (debug API)', () => {
    const { pan, root } = setup();
    pan.panByPixels(200, 0);
    settle(pan);
    expect(root.position.length()).toBeGreaterThan(1);
  });
});

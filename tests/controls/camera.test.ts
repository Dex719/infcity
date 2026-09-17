import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CAMERA } from '@/config';
import { CameraRig } from '@/controls/CameraRig';

describe('CameraRig (FR-8.2, design C11)', () => {
  it('стартует на HEIGHT_START, смотрит в начало координат', () => {
    const rig = new CameraRig(16 / 9);
    expect(rig.camera.fov).toBe(CAMERA.FOV);
    expect(rig.camera.position.toArray()).toEqual([
      CAMERA.OFFSET.x,
      CAMERA.HEIGHT_START,
      CAMERA.OFFSET.z,
    ]);
    const ground = rig.groundPoint(0, 0);
    expect(ground).not.toBeNull();
    expect(ground?.length() ?? 1).toBeLessThan(1e-6);
  });

  it('колесо и пинч ограничены диапазоном высот (AC-8.2)', () => {
    const rig = new CameraRig(2);
    for (let i = 0; i < 100; i++) {
      rig.wheel(100);
    }
    expect(rig.targetHeight).toBe(CAMERA.HEIGHT_MAX);
    for (let i = 0; i < 100; i++) {
      rig.wheel(-100);
    }
    expect(rig.targetHeight).toBe(CAMERA.HEIGHT_MIN);
    rig.pinch(0.5);
    expect(rig.targetHeight).toBe(CAMERA.HEIGHT_MIN * 2);
    rig.pinch(100);
    expect(rig.targetHeight).toBe(CAMERA.HEIGHT_MIN);
  });

  it('высота плавно догоняет цель и сходится', () => {
    const rig = new CameraRig(2);
    rig.setTargetHeight(CAMERA.HEIGHT_MIN);
    rig.update(1 / 60);
    expect(rig.currentHeight).toBeLessThan(CAMERA.HEIGHT_START);
    expect(rig.currentHeight).toBeGreaterThan(CAMERA.HEIGHT_MIN);
    for (let i = 0; i < 600; i++) {
      rig.update(1 / 60);
    }
    expect(rig.currentHeight).toBe(CAMERA.HEIGHT_MIN);
    expect(rig.camera.position.y).toBe(CAMERA.HEIGHT_MIN);
  });

  it('точка земли под краями экрана лежит дальше от центра при большей высоте', () => {
    const rig = new CameraRig(2);
    rig.snapHeight(CAMERA.HEIGHT_MIN);
    const near = rig.groundPoint(1, 0, new Vector3());
    rig.snapHeight(CAMERA.HEIGHT_MAX);
    const far = rig.groundPoint(1, 0, new Vector3());
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect((far?.length() ?? 0) > (near?.length() ?? 0)).toBe(true);
  });
});

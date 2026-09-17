import { describe, expect, it } from 'vitest';
import { countOverlaps, overlaps, type CarBox } from '@/mobs/Collisions';

function box(x: number, z: number, axis: 'x' | 'z', halfLength = 2.2): CarBox {
  return {
    x,
    z,
    dirX: axis === 'x' ? 1 : 0,
    dirZ: axis === 'z' ? 1 : 0,
    halfLength,
    halfWidth: 1.25,
  };
}

describe('Collisions — bbox машин (AC-6.1)', () => {
  it('машины на одной полосе: пересечение при перекрытии длин, касание не считается', () => {
    expect(overlaps(box(0, 0, 'x'), box(4, 0, 'x'))).toBe(true);
    expect(overlaps(box(0, 0, 'x'), box(4.4, 0, 'x'))).toBe(false);
    expect(overlaps(box(0, 0, 'x'), box(10, 0, 'x'))).toBe(false);
  });

  it('соседние полосы (5 юнитов) не пересекаются, поперечные на перекрёстке — да', () => {
    expect(overlaps(box(0, 0, 'x'), box(0, 5, 'x'))).toBe(false);
    expect(overlaps(box(0, 0, 'x'), box(0, 0, 'z'))).toBe(true);
    expect(overlaps(box(0, 0, 'x'), box(0, 4, 'z'))).toBe(false);
  });

  it('countOverlaps считает пары независимо от порядка', () => {
    const boxes = [box(0, 0, 'x'), box(3, 0, 'x'), box(50, 0, 'x'), box(50, 0.5, 'z')];
    expect(countOverlaps(boxes)).toBe(2);
    expect(countOverlaps([...boxes].reverse())).toBe(2);
    expect(countOverlaps([])).toBe(0);
  });
});

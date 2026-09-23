import { BufferAttribute, BufferGeometry, type Vector3 } from 'three';

/** Порог «грань смотрит на солнце» для нормированного косинуса: почти ребром — остаётся в тени. */
const FACING_EPS = 1e-4;

/** Статика чанка, разделённая по отношению к солнцу (BUG-10, design D20). */
export interface SunSplit {
  /** Грани, обращённые от солнца: только они попадают в карту теней. */
  readonly cast: BufferGeometry;
  /** Грани, обращённые к солнцу: в теневом проходе они отсекались бы всё равно. */
  readonly lit: BufferGeometry;
}

/**
 * Делит индексированную геометрию на грани, обращённые к солнцу и от него (BUG-10, design
 * D20). Теневой проход three (PCF, `shadowSide` = `BackSide` для `FrontSide`-материала, в WebGL
 * и WebGPU одинаково) рисует в карту теней только грани, обращённые от света, — крыши,
 * газоны, дороги и освещённые стены туда не попадают никогда, но отправляются на отрисовку
 * и считаются в треугольники кадра. Вынесенные в меш без тени, они перестают нагружать
 * теневой проход, а карта теней не меняется ни на пиксель. Обе геометрии делят буферы
 * вершин исходной — различаются только индексом.
 * @param toSun нормированное направление от сцены на солнце
 */
export function splitBySun(geometry: BufferGeometry, toSun: Vector3): SunSplit {
  const pos = geometry.getAttribute('position');
  const index = geometry.index;
  if (index === null) {
    throw new Error('splitBySun: ожидалась индексированная геометрия');
  }
  const cast: number[] = [];
  const lit: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const ax = pos.getX(a);
    const ay = pos.getY(a);
    const az = pos.getZ(a);
    const ux = pos.getX(b) - ax;
    const uy = pos.getY(b) - ay;
    const uz = pos.getZ(b) - az;
    const vx = pos.getX(c) - ax;
    const vy = pos.getY(c) - ay;
    const vz = pos.getZ(c) - az;
    // Нормаль грани по обходу — по ней же растеризатор решает, лицевая ли грань для света.
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    const facing = len > 0 ? (nx * toSun.x + ny * toSun.y + nz * toSun.z) / len : 0;
    (facing > FACING_EPS ? lit : cast).push(a, b, c);
  }
  const make = (indices: number[]): BufferGeometry => {
    const part = new BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      part.setAttribute(name, attribute);
    }
    part.setIndex(
      pos.count > 65535
        ? new BufferAttribute(new Uint32Array(indices), 1)
        : new BufferAttribute(new Uint16Array(indices), 1),
    );
    part.boundingSphere = geometry.boundingSphere?.clone() ?? null;
    return part;
  };
  return { cast: make(cast), lit: make(lit) };
}

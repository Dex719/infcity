import { AO } from '@/config';
import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { mulberry32 } from '@/world/Hash';
import { type GeometryBatch, type HaloWidths, Templates } from './GeometryBatch';
import { CHUNK_HIDDEN, type HiddenSides } from './Visibility';

/** Доля крыш с деталями (FR-15.5, AC-15.4: ≥ 40 %). */
export const ROOF_DETAIL_PROBABILITY = 0.65;

/** Высота этажа, юниты. */
export const FLOOR = 2.7;

/** Прямоугольник на земле: центр и размеры. */
export interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}

/** Ореол AO одного корпуса: прямоугольник у основания и ширины кольца по сторонам (FR-19.2). */
export interface Halo {
  readonly footprint: Footprint;
  readonly widths: HaloWidths;
}

/**
 * Процедурные здания low-poly (FR-3.4, D2/D3): корпус, оконные полосы по этажам,
 * крыша, вход. Стеклянные части идут в отдельный батч (`glass`), чтобы рендериться
 * полупрозрачными вторым draw call'ом.
 */
export class Buildings {
  /** Счётчики покрытия деталями крыш (AC-15.4). */
  roofs = 0;
  roofsWithDetails = 0;
  /**
   * Цвет покрытия квартала под зданиями (FR-19.2): его задаёт раскладка вместе с полным
   * газоном квартала; `null` — ореолы не строятся.
   */
  groundKey: PaletteKey | null = null;
  /** Отпечатки корпусов у земли — основание цоколя или стены, если цоколя нет (FR-19.2). */
  private readonly footprints: Footprint[] = [];

  constructor(
    private readonly batch: GeometryBatch,
    private readonly glass: GeometryBatch,
    private readonly m: Materials,
    private readonly rng: () => number = mulberry32(1),
    /** Скрытые локальные стороны квартала (design D13): на них не строятся плоские накладки. */
    private readonly hidden: HiddenSides = CHUNK_HIDDEN,
    /** Батч слоя деталей (design D14); по умолчанию — общий батч, чтобы не ломать тесты. */
    private readonly detail: GeometryBatch = batch,
  ) {}

  /** Панельная/кирпичная жилая коробка с рядами окон на всех фасадах. */
  panelHouse(f: Footprint, floors: number, wall: PaletteKey = 'panel-grey'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(wall));
    this.plinth(f);
    const roof = this.m.shade('roof-dark', 1);
    b.box(f.x, h + 0.2, f.z, f.w + 0.4, 0.4, f.d + 0.4, roof);
    this.cornice(f, h);
    this.windowRows(f, floors, 'glass-navy', 0.55);
    this.balconies(f, floors, 'panel-grey');
    this.entrance(f, 'z');
    // Лифтовая надстройка.
    b.box(f.x + f.w * 0.25, h + 1.2, f.z, 3, 2, 3, this.m.color(wall));
    this.roofDetails(f, h + 0.4);
  }

  /** Новостройка: светлый корпус с цветными балконными полосами. */
  modernTower(f: Footprint, floors: number, accent: PaletteKey = 'glass-teal'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('stone-light'));
    this.plinth(f);
    b.box(f.x, h + 0.2, f.z, f.w + 0.3, 0.4, f.d + 0.3, this.m.color('white'));
    this.cornice(f, h);
    this.windowRows(f, floors, 'glass-blue', 0.6);
    this.balconies(f, floors, accent);
    // Вертикальная акцентная полоса (лоджии).
    b.boxAo(f.x - f.w / 2 - 0.15, h / 2, f.z, 0.3, h, f.d * 0.35, this.m.color(accent));
    b.boxAo(f.x + f.w / 2 + 0.15, h / 2, f.z, 0.3, h, f.d * 0.35, this.m.color(accent));
    b.box(f.x, h + 1, f.z, f.w * 0.5, 1.6, f.d * 0.5, this.m.color('stone-light'));
    this.roofDetails(f, h + 0.4);
  }

  /** Стеклянная башня делового центра: корпус в стекле, стальные пояса, «корона». */
  glassTower(f: Footprint, floors: number, tint: PaletteKey = 'glass-blue'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    // Непрозрачное ядро чуть меньше габарита, стеклянная оболочка — в glass-батче.
    b.boxAo(f.x, h / 2, f.z, f.w - 0.8, h, f.d - 0.8, this.m.shade(tint, 0.55));
    this.glass.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(tint));
    this.registerFootprint(f, 0);
    const band = this.m.color('steel');
    for (let i = 1; i < floors; i += 2) {
      b.box(f.x, i * FLOOR, f.z, f.w + 0.2, 0.18, f.d + 0.2, band);
    }
    b.box(f.x, h + 0.3, f.z, f.w + 0.4, 0.6, f.d + 0.4, this.m.color('white'));
    b.box(f.x, h + 0.6 + 2, f.z, f.w * 0.6, 4, f.d * 0.6, this.m.shade(tint, 0.7));
    b.box(f.x, h + 4.6 + 2.5, f.z, 0.4, 5, 0.4, this.m.color('steel'));
    this.roofDetails(f, h + 0.6);
  }

  /** Торговый ряд: 2–3 этажа, витрины, маркизы, вывеска. */
  shopRow(f: Footprint, floors: number, wall: PaletteKey, awning: PaletteKey): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(wall));
    this.plinth(f);
    b.box(f.x, h + 0.15, f.z, f.w + 0.3, 0.3, f.d + 0.3, this.m.color('roof-dark'));
    this.cornice(f, h);
    // Витрина первого этажа со стойками и вывеской — вынесена в storefront (TSK-108).
    this.storefront(f);
    // Маркизы и вывеска идут на ту же сторону, что и витрина: `storefront` выбирает её по
    // `hidden`, и если фасадные элементы оставить жёстко на +Z, при rotation 2 и 3 витрина
    // окажется на одной стене, а козырьки и вывеска — на противоположной (рецензия 2026-09-19).
    const frontSign = -this.hidden.z as 1 | -1;
    const front = f.z + frontSign * (f.d / 2);
    const awningCount = Math.max(1, Math.floor(f.w / 4));
    const step = f.w / awningCount;
    for (let i = 0; i < awningCount; i++) {
      const ax = f.x - f.w / 2 + step * (i + 0.5);
      b.box(ax, 2.9, front + frontSign * 0.7, step - 0.6, 0.15, 1.4, this.m.color(awning));
    }
    if (floors > 1) {
      this.windowRows({ ...f, d: f.d }, floors, 'glass-navy', 0.5, 1);
    }
    // Вывеска на крыше.
    b.box(f.x, h + 1.1, front - frontSign * 0.6, f.w * 0.5, 1.4, 0.2, this.m.color('white'));
    b.box(f.x, h + 1.1, front - frontSign * 0.45, f.w * 0.36, 0.5, 0.05, this.m.color(awning));
    this.roofDetails(f, h + 0.3);
  }

  /** Торговый центр (FR-15.1): широкий корпус, волнистый парапет, портал входа, вывеска. */
  mall(f: Footprint, accent: PaletteKey = 'gold'): void {
    const b = this.batch;
    const h = 12;
    const front = f.z + f.d / 2;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('stone-light'));
    this.plinth(f);
    b.box(f.x, h + 0.25, f.z, f.w + 0.4, 0.5, f.d + 0.4, this.m.color('white'));
    this.cornice(f, h);
    const seg = 6;
    let up = true;
    for (let x = f.x - f.w / 2 + seg / 2; x < f.x + f.w / 2; x += seg) {
      b.box(
        x,
        h + 0.5 + (up ? 0.9 : 0.4),
        front - 0.3,
        seg - 0.4,
        up ? 1.8 : 0.8,
        0.5,
        this.m.color(accent),
      );
      up = !up;
    }
    // Ленточное остекление второго этажа по фасаду и торцам.
    this.glass.box(f.x, 8.5, front + 0.06, f.w - 4, 2.4, 0.12, this.m.color('glass-teal'));
    this.glass.box(f.x - f.w / 2 - 0.06, 8.5, f.z, 0.12, 2.4, f.d - 4, this.m.color('glass-teal'));
    this.glass.box(f.x + f.w / 2 + 0.06, 8.5, f.z, 0.12, 2.4, f.d - 4, this.m.color('glass-teal'));
    // Портал входа.
    b.boxAo(f.x, 3.5, front + 1.2, 12, 7, 2.4, this.m.color('white'));
    this.glass.box(f.x, 2.6, front + 2.45, 9, 5, 0.15, this.m.color('glass-blue'));
    b.box(f.x, 7.2, front + 1.2, 13, 0.5, 3.2, this.m.color(accent));
    // Вывеска с «буквами».
    b.box(f.x, h + 2.4, front - 0.6, 14, 2.2, 0.4, this.m.color('white'));
    for (let i = 0; i < 4; i++) {
      b.box(f.x - 4.5 + i * 3, h + 2.4, front - 0.3, 2.0, 1.3, 0.2, this.m.color(accent));
    }
    this.roofDetails(f, h + 0.5);
  }

  /**
   * Детали крыши (FR-15.5): антенны, кондиционеры, баки, спутниковые тарелки, вентиляция —
   * детерминированно по `rng`, примерно на 65 % крыш.
   */
  roofDetails(f: Footprint, top: number): void {
    this.roofs++;
    if (this.rng() >= ROOF_DETAIL_PROBABILITY) {
      return;
    }
    this.roofsWithDetails++;
    // Антенны, кондиционеры и баки — мелочь: уходят в слой деталей LOD (FR-18.9).
    const b = this.detail;
    const steel = this.m.color('steel');
    const dark = this.m.color('roof-dark');
    const white = this.m.color('white');
    const count = 1 + Math.floor(this.rng() * 3);
    for (let i = 0; i < count; i++) {
      const px = f.x + (this.rng() - 0.5) * Math.max(2, f.w - 5);
      const pz = f.z + (this.rng() - 0.5) * Math.max(2, f.d - 5);
      switch (Math.floor(this.rng() * 5)) {
        case 0:
          b.box(px, top + 3, pz, 0.14, 6, 0.14, steel);
          b.box(px, top + 4.6, pz, 1.6, 0.08, 0.08, steel);
          b.box(px, top + 5.5, pz, 1.0, 0.08, 0.08, steel);
          break;
        case 1:
          b.box(px, top + 0.5, pz, 1.6, 1.0, 1.3, this.m.color('panel-grey'));
          b.place(Templates.cylinder8, px, top + 1.05, pz, 0.45, 0.1, 0.45, dark);
          break;
        case 2:
          for (const [sx, sz] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ] as const) {
            b.box(px + sx * 0.55, top + 0.6, pz + sz * 0.55, 0.12, 1.2, 0.12, steel);
          }
          b.place(Templates.cylinder8, px, top + 2.1, pz, 0.9, 1.8, 0.9, white);
          break;
        case 3:
          b.box(px, top + 0.9, pz, 0.18, 1.8, 0.18, steel);
          b.placeRotated(
            Templates.cylinder16,
            px,
            top + 2.0,
            pz + 0.4,
            0.9,
            0.12,
            0.9,
            -1.1,
            0,
            0,
            white,
          );
          break;
        default:
          b.box(px, top + 1.0, pz, 1.2, 2.0, 1.2, this.m.color('concrete'));
          b.box(px, top + 2.15, pz, 1.6, 0.3, 1.6, dark);
      }
    }
  }

  /** Крытый рынок: широкий низкий корпус с рядом навесов. */
  marketHall(f: Footprint): void {
    const b = this.batch;
    const h = 5;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('sand'));
    this.registerFootprint(f, 0);
    b.place(
      Templates.cylinder8,
      f.x,
      h + 1.4,
      f.z,
      f.d / 2,
      f.w,
      f.d / 2,
      this.m.color('roof-red'),
      Math.PI / 2,
    );
    b.box(f.x, h + 1.5, f.z, f.w * 0.9, 3.2, f.d * 0.3, this.m.color('roof-red'));
    b.box(f.x, 2.2, f.z + f.d / 2 + 0.3, f.w * 0.8, 0.2, 2, this.m.color('white'));
  }

  /** Торговый лоток с цветной крышей. */
  stall(x: number, z: number, roof: PaletteKey, rot = 0): void {
    const b = this.batch;
    b.box(x, 0.6, z, 2.6, 1.2, 1.6, this.m.color('brick'), rot);
    b.box(x, 2.3, z, 3, 0.15, 2.2, this.m.color(roof), rot);
    b.box(x - 1.3, 1.5, z - 0.9, 0.12, 1.4, 0.12, this.m.color('steel'), rot);
    b.box(x + 1.3, 1.5, z - 0.9, 0.12, 1.4, 0.12, this.m.color('steel'), rot);
  }

  /** Учебный корпус: длинный светлый блок с колоннадой и куполом. */
  campusHall(f: Footprint, floors = 3): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('white'));
    this.plinth(f);
    b.box(f.x, h + 0.2, f.z, f.w + 0.4, 0.4, f.d + 0.4, this.m.color('glass-teal'));
    this.cornice(f, h);
    this.windowRows(f, floors, 'glass-navy', 0.5);
    this.entrance(f, 'z');
    // Колоннада и портик — на той же стороне, что и вход (`entrance` выбирает её по `hidden`);
    // при жёстком +Z они расходились по разным стенам (рецензия 2026-09-19).
    const frontSign = -this.hidden.z as 1 | -1;
    const front = f.z + frontSign * (f.d / 2 + 1.2);
    const columns = Math.max(3, Math.floor(f.w / 3.5));
    for (let i = 0; i < columns; i++) {
      const x = f.x - f.w / 2 + 1.5 + ((f.w - 3) * i) / (columns - 1);
      b.place(Templates.cylinder8, x, h / 2, front, 0.35, h, 0.35, this.m.color('white'));
    }
    b.box(f.x, h + 0.7, front, f.w, 0.5, 2.6, this.m.color('white'));
    b.place(Templates.sphereLow, f.x, h + 1.5, f.z, 3.2, 2.4, 3.2, this.m.color('flag-blue'));
  }

  /** Стадион: овальная чаша, трибуны, поле, мачты освещения. */
  stadium(cx: number, cz: number, rx: number, rz: number): void {
    const b = this.batch;
    b.place(Templates.cylinder16, cx, 3, cz, rx, 6, rz, this.m.color('stone-light'));
    b.place(Templates.cylinder16, cx, 6.5, cz, rx * 0.92, 1, rz * 0.92, this.m.color('flag-blue'));
    b.place(Templates.cylinder16, cx, 6.6, cz, rx * 0.72, 1, rz * 0.72, this.m.color('grass'));
    b.place(Templates.cylinder16, cx, 8, cz, rx * 1.05, 0.6, rz * 1.05, this.m.color('white'));
    // Внешние рёбра-опоры.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.box(
        cx + Math.cos(a) * rx * 1.02,
        4,
        cz + Math.sin(a) * rz * 1.02,
        0.5,
        8.5,
        0.5,
        this.m.color('steel'),
        -a,
      );
    }
    const masts: [number, number][] = [
      [rx * 0.8, rz * 0.8],
      [-rx * 0.8, rz * 0.8],
      [rx * 0.8, -rz * 0.8],
      [-rx * 0.8, -rz * 0.8],
    ];
    for (const [mx, mz] of masts) {
      b.box(cx + mx, 9, cz + mz, 0.5, 18, 0.5, this.m.color('steel'));
      b.box(cx + mx, 18.5, cz + mz, 3, 1.2, 0.6, this.m.color('white'));
    }
  }

  /**
   * Цоколь у земли (FR-18.6, design «C7: фасады»): бокс шире корпуса на 0.3 юнита по каждой
   * оси, обхватывает здание по периметру — как и существующие плиты крыши, строится
   * безусловно (это не однобокая накладка, а симметричный обхват, правило D13 его не касается).
   */
  private plinth(f: Footprint): void {
    this.batch.boxAo(f.x, 0.3, f.z, f.w + 0.3, 0.6, f.d + 0.3, this.m.color('concrete'));
    this.registerFootprint(f, 0.15);
  }

  /** Запомнить отпечаток корпуса у земли для ореола AO (`pad` — выступ цоколя за стену). */
  private registerFootprint(f: Footprint, pad: number): void {
    this.footprints.push({ x: f.x, z: f.z, w: f.w + 2 * pad, d: f.d + 2 * pad });
  }

  /**
   * Ореолы AO вокруг всех корпусов квартала (FR-19.2, AC-19.2, design D15): кольцо цвета
   * покрытия (`groundKey`) шириной `AO.GROUND_WIDTH`, у стены затемнённое до `AO.GROUND_MIN`.
   * Строятся разом в конце сборки квартала, потому что ширина зависит от соседей: сторона,
   * обращённая к соседнему корпусу, урезается до половины зазора — кольца касаются, но не
   * перекрываются (совпадающие плоскости дали бы z-fighting). Внешний край не выходит за
   * покрытие квартала (±`limit`): дальше лежит тротуар другого цвета.
   * @param y высота кольца — покрытие квартала + `AO.GROUND_LIFT`
   * @param limit полуширина покрытия квартала
   * @returns ширины построенных колец (тесты и диагностика)
   */
  flushHalos(y: number, limit: number): Halo[] {
    const halos: Halo[] = [];
    if (this.groundKey === null) {
      this.footprints.length = 0;
      return halos;
    }
    const color = this.m.color(this.groundKey);
    const full = AO.GROUND_WIDTH;
    for (const f of this.footprints) {
      let px = Math.min(full, limit - (f.x + f.w / 2));
      let nx = Math.min(full, f.x - f.w / 2 + limit);
      let pz = Math.min(full, limit - (f.z + f.d / 2));
      let nz = Math.min(full, f.z - f.d / 2 + limit);
      for (const o of this.footprints) {
        if (o === f) {
          continue;
        }
        const gapX = Math.max(o.x - o.w / 2 - (f.x + f.w / 2), f.x - f.w / 2 - (o.x + o.w / 2));
        const gapZ = Math.max(o.z - o.d / 2 - (f.z + f.d / 2), f.z - f.d / 2 - (o.z + o.d / 2));
        if (gapX >= 2 * full || gapZ >= 2 * full) {
          continue;
        }
        // Разводим по оси, вдоль которой корпуса разнесены сильнее: половина зазора — каждому.
        const half = Math.max(0, Math.max(gapX, gapZ) / 2);
        if (gapX >= gapZ) {
          if (o.x > f.x) {
            px = Math.min(px, half);
          } else {
            nx = Math.min(nx, half);
          }
        } else if (o.z > f.z) {
          pz = Math.min(pz, half);
        } else {
          nz = Math.min(nz, half);
        }
      }
      const widths: HaloWidths = {
        px: Math.max(0, px),
        nx: Math.max(0, nx),
        pz: Math.max(0, pz),
        nz: Math.max(0, nz),
      };
      this.batch.halo(f.x, f.z, f.w, f.d, y, widths, color, AO.GROUND_MIN);
      halos.push({ footprint: f, widths });
    }
    this.footprints.length = 0;
    return halos;
  }

  /**
   * Карниз под кровлей (FR-18.6, design «C7: фасады»): бокс шире корпуса на 0.5 юнита,
   * лежит чуть ниже верха стены (`top`), чтобы не пересекаться с плитой крыши, которая
   * начинается на уровне `top` у всех пяти типов домов.
   */
  private cornice(f: Footprint, top: number): void {
    this.batch.box(f.x, top - 0.15, f.z, f.w + 0.5, 0.25, f.d + 0.5, this.m.color('white'));
  }

  /**
   * Балконы (FR-18.6, AC-18.6, design «C7: фасады»): на одной видимой стороне (см. D13,
   * `this.hidden`) — каждый второй этаж начиная со второго, по 2 балкона в ряд: плита
   * `concrete` + ограждение заданного цвета. Балконы — выступающий объём, а не накладка,
   * поэтому строились бы на любой стороне (D13), но чтобы не удваивать геометрию, ставим
   * их только на видимую сторону — вторая сторона в кадр не попадает ни при какой позиции
   * камеры. Мелочь — уходит в слой деталей LOD (`this.detail`, design D14).
   * Бюджет: не больше 2 «балконных» этажей × 2 балкона = 4 балкона = 192 вершины на дом.
   * Ярусов было четыре: сплошной перебор 56 388 кварталов (4 сида × сетка 121×121) показал
   * превышения потолка 7 000 вершин на плотных раскладках с четырьмя домами — 7 065 и 7 031
   * при четырёх ярусах, 7 048 при трёх. На двух ярусах максимум по всему перебору 6 664,
   * превышений нет; AC-18.6 (≥ 4 балконов на девятиэтажном доме) остаётся выполненным ровно.
   */
  private balconies(f: Footprint, floors: number, color: PaletteKey): void {
    const b = this.detail;
    const concrete = this.m.color('concrete');
    const rail = this.m.color(color);
    const zSign = -this.hidden.z as 1 | -1;
    const plateZ = f.z + zSign * (f.d / 2 + 0.45);
    const railZ = f.z + zSign * (f.d / 2 + 0.86);
    const offsets = [-f.w * 0.22, f.w * 0.22];
    const maxRows = 2;
    let rows = 0;
    for (let i = 1; i < floors && rows < maxRows; i += 2) {
      const plateY = i * FLOOR + 0.06;
      const railY = i * FLOOR + 0.47;
      for (const dx of offsets) {
        b.box(f.x + dx, plateY, plateZ, 2.2, 0.12, 0.9, concrete);
        b.box(f.x + dx, railY, railZ, 2.2, 0.7, 0.08, rail);
      }
      rows++;
    }
  }

  /**
   * Входная группа (FR-18.6, AC-18.6, design «C7: фасады», TSK-107): крыльцо, две понижающиеся
   * ступени и козырёк на двух стойках. Выступает за фасад, поэтому строится всегда — правило
   * D13 про плоские накладки её не касается, — но сторону выбираем по `this.hidden`, как и для
   * балконов (`balconies`), а не жёстко: иначе вход задваивал бы геометрию на стороне, которую
   * камера не видит ни при какой позиции. `side` задаёт, к какой стене примыкает вход: `'z'` —
   * длинная ось крыльца (3.0) идёт вдоль X, вылет — вдоль Z (панельный дом, учебный корпус);
   * `'x'` — наоборот. Крыльцо и ступени — общий объём здания, идут в основной батч; козырёк и
   * стойки — мелочь, уходят в слой деталей LOD (`this.detail`, design D14).
   * Бюджет TSK-107: крыльцо (24) + 2 ступени (48) + козырёк (24) + 2 стойки (48) = 144 ≤ 168.
   */
  private entrance(f: Footprint, side: 'x' | 'z' = 'z'): void {
    const b = this.batch;
    const d = this.detail;
    const concrete = this.m.color('concrete');
    const white = this.m.color('white');
    const steel = this.m.color('steel');
    const lengthAlongX = side === 'z';
    const sign = (side === 'z' ? -this.hidden.z : -this.hidden.x) as 1 | -1;
    const wallOffset = lengthAlongX ? f.d / 2 : f.w / 2;

    // Крыльцо: плита у земли, выступает за фасад на 1.6 юнита.
    const porchW = 3.0;
    const porchD = 1.6;
    const porchOut = wallOffset + porchD / 2;
    const px = lengthAlongX ? f.x : f.x + sign * porchOut;
    const pz = lengthAlongX ? f.z + sign * porchOut : f.z;
    b.box(
      px,
      0.15,
      pz,
      lengthAlongX ? porchW : porchD,
      0.3,
      lengthAlongX ? porchD : porchW,
      concrete,
    );

    // Две ступени, понижающиеся наружу от крыльца к земле.
    const stepW = 2.6;
    const stepD = 0.45;
    const steps: readonly [number, number][] = [
      [wallOffset + porchD + stepD / 2, 0.2],
      [wallOffset + porchD + stepD * 1.5, 0.1],
    ];
    for (const [out, sh] of steps) {
      const sx = lengthAlongX ? f.x : f.x + sign * out;
      const sz = lengthAlongX ? f.z + sign * out : f.z;
      b.box(
        sx,
        sh / 2,
        sz,
        lengthAlongX ? stepW : stepD,
        sh,
        lengthAlongX ? stepD : stepW,
        concrete,
      );
    }

    // Козырёк на двух стойках — мелочь, слой деталей (D14).
    const postOut = wallOffset + 1.3;
    const postSpread = porchW / 2 - 0.3;
    for (const spread of [-postSpread, postSpread]) {
      const stx = lengthAlongX ? f.x + spread : f.x + sign * postOut;
      const stz = lengthAlongX ? f.z + sign * postOut : f.z + spread;
      d.box(stx, 1.3, stz, 0.12, 2.6, 0.12, steel);
    }
    const canopyW = 3.4;
    const canopyD = 1.8;
    const canopyOut = wallOffset + canopyD / 2;
    const cx = lengthAlongX ? f.x : f.x + sign * canopyOut;
    const cz = lengthAlongX ? f.z + sign * canopyOut : f.z;
    d.box(
      cx,
      2.7,
      cz,
      lengthAlongX ? canopyW : canopyD,
      0.2,
      lengthAlongX ? canopyD : canopyW,
      white,
    );
  }

  /**
   * Витрина торгового ряда (FR-18.6, AC-18.6, design «C7: фасады», TSK-108): стеклянная лента
   * первого этажа на видимой стороне (`this.hidden`, D13) — раньше стояла жёстко на +Z, что при
   * повороте квартала пряталось за угол. Витрина — плоская накладка (выступ 0.05), поэтому её
   * сторону выбираем по `hidden.z`, как окна (`windowRows`). Стойки и вывеска с накладкой — мелочь,
   * уходят в слой деталей LOD (`this.detail`, design D14).
   * Бюджет TSK-108: витрина (24) + 3 стойки (72) + вывеска (24) + накладка (24) = 144.
   */
  private storefront(f: Footprint): void {
    const zSign = -this.hidden.z as 1 | -1;
    const wallZ = f.z + zSign * (f.d / 2);

    // Витрина — стекло, основной глянцевый батч.
    const glassZ = wallZ + zSign * 0.05;
    this.glass.box(f.x, 1.4, glassZ, f.w - 1, 2.2, 0.1, this.m.color('glass-blue'));

    // Три вертикальные стойки, обрамляющие витрину.
    const d = this.detail;
    const steel = this.m.color('steel');
    const spread = (f.w - 1) / 2;
    for (const dx of [-spread, 0, spread]) {
      d.box(f.x + dx, 1.2, glassZ, 0.15, 2.4, 0.1, steel);
    }

    // Вывеска над витриной с цветной накладкой.
    const signZ = wallZ + zSign * 0.12;
    d.box(f.x, 2.75, signZ, f.w * 0.5, 0.5, 0.1, this.m.color('white'));
    d.box(f.x, 2.75, signZ + zSign * 0.06, f.w * 0.36, 0.3, 0.1, this.m.color('accent-red'));
  }

  /**
   * Ряды окон по этажам (тонкие полосы заподлицо с фасадом). Строятся только на двух видимых
   * фасадах: полосы на сторонах, смотрящих в мировые −X и −Z, не попадают в кадр ни при какой
   * позиции камеры (design D13, FR-18.1) — это половина вершин типового дома.
   */
  private windowRows(
    f: Footprint,
    floors: number,
    color: PaletteKey,
    ratio: number,
    fromFloor = 0,
  ): void {
    const b = this.batch;
    const c = this.m.color(color);
    const zSign = -this.hidden.z as 1 | -1;
    const xSign = -this.hidden.x as 1 | -1;
    for (let i = fromFloor; i < floors; i++) {
      const y = i * FLOOR + FLOOR * 0.55;
      const hh = FLOOR * 0.42;
      b.box(f.x, y, f.z + zSign * (f.d / 2 + 0.06), f.w * ratio, hh, 0.12, c);
      b.box(f.x + xSign * (f.w / 2 + 0.06), y, f.z, 0.12, hh, f.d * ratio, c);
    }
  }
}

import { AO, FACADE, ROOF } from '@/config';
import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { mulberry32 } from '@/world/Hash';
import { type EllipseRing, type GeometryBatch, type HaloWidths, Templates } from './GeometryBatch';
import { CHUNK_HIDDEN, type HiddenSides } from './Visibility';

/** Доля крыш с деталями (FR-15.5, AC-15.4: ≥ 40 %). */
export const ROOF_DETAIL_PROBABILITY = 0.65;

/** Высота этажа, юниты. */
export const FLOOR = 2.7;

/** Верх газона футбольного поля стадиона (FR-19.13): поле — цилиндр 6.0…7.1 на цоколе чаши. */
export const FIELD_TOP = 7.1;

/**
 * Цвет парапета панельного дома по цвету стен (FR-19.5): акцент без `rng`, как цветные
 * бортики крыш у референса; кирпичу — белый, светлым стенам — цвета флага и бирюза.
 */
const PANEL_RIM: Readonly<Partial<Record<PaletteKey, PaletteKey>>> = {
  'panel-grey': 'glass-teal',
  brick: 'white',
  sand: 'roof-red',
  'stone-light': 'flag-blue',
  white: 'glass-teal',
};

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
 * Регистрация AO контакта с землёй (FR-19.2, FR-19.14): плита под объёмами и их отпечатки;
 * ореолы строит `Buildings.flushHalos` в конце сборки квартала. Ландмарки получают её в
 * контексте сборки (`LandmarkContext.ao`).
 */
export interface GroundAo {
  /**
   * Плита под объёмами: цвет, высота её верха (по умолчанию — газон квартала) и полуширина
   * (по умолчанию — покрытие квартала): ореолы ложатся на неё и режутся по её краю.
   */
  ground(key: PaletteKey, top?: number, half?: number): void;
  /** Прямоугольный отпечаток объёма на плите: центр и размеры. */
  footprint(x: number, z: number, w: number, d: number): void;
  /** Эллиптическое основание: центр и полуоси. */
  ellipse(cx: number, cz: number, rx: number, rz: number): void;
}

/**
 * Процедурные здания low-poly (FR-3.4, D2/D3): корпус с AO у основания, окна проёмами по
 * этажам, кровля с цветным парапетом, вход (FR-19). Стеклянные части идут в отдельный батч
 * (`glass`), чтобы рендериться полупрозрачными вторым draw call'ом.
 */
export class Buildings implements GroundAo {
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
  /** Круглые основания у земли (чаша стадиона) для эллиптических ореолов (FR-19.12). */
  private readonly ellipses: { cx: number; cz: number; rx: number; rz: number }[] = [];
  /** Верх плиты под объёмами, если это не газон квартала (FR-19.14). */
  private groundTop: number | null = null;
  /** Полуширина плиты под объёмами, если она меньше покрытия квартала (FR-19.14). */
  private groundHalf: number | null = null;

  constructor(
    private readonly batch: GeometryBatch,
    private readonly glass: GeometryBatch,
    private readonly m: Materials,
    private readonly rng: () => number = mulberry32(1),
    /** Скрытые локальные стороны квартала (design D13): на них не строятся плоские накладки. */
    private readonly hidden: HiddenSides = CHUNK_HIDDEN,
    /** Батч мелких деталей (вливается в статику чанка); по умолчанию — общий батч. */
    private readonly detail: GeometryBatch = batch,
  ) {}

  /** Панельная/кирпичная жилая коробка: окна на видимых фасадах, кровля с парапетом. */
  panelHouse(f: Footprint, floors: number, wall: PaletteKey = 'panel-grey'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(wall));
    this.plinth(f);
    const roof = this.m.color('roof');
    b.box(f.x, h + 0.2, f.z, f.w + 0.4, 0.4, f.d + 0.4, roof);
    this.parapet(f, 0.4, h + 0.4, PANEL_RIM[wall] ?? 'white');
    this.cornice(f, h);
    this.windows(f, floors, 'glass-navy', 0.55);
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
    b.box(f.x, h + 0.2, f.z, f.w + 0.3, 0.4, f.d + 0.3, this.m.color('roof'));
    this.parapet(f, 0.3, h + 0.4, accent);
    this.cornice(f, h);
    this.windows(f, floors, 'glass-blue', 0.6, 0, f.d * 0.175);
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
    // Навесная стена (FR-19.15): вертикальные импосты во всю высоту с шагом
    // `FACADE.MULLION_STEP`, считая угловые, — вместе с поясами фасад читается сеткой окон.
    // Импост — плоская накладка (вынос 0.05), поэтому только на видимых сторонах (D13).
    const zSign = -this.hidden.z as 1 | -1;
    const xSign = -this.hidden.x as 1 | -1;
    const mullions = (length: number): number[] => {
      const count = Math.max(2, Math.floor(length / FACADE.MULLION_STEP) + 1);
      return Array.from({ length: count }, (_, k) => -length / 2 + (k * length) / (count - 1));
    };
    for (const dx of mullions(f.w)) {
      b.box(f.x + dx, h / 2, f.z + zSign * (f.d / 2 + 0.05), 0.14, h, 0.1, band);
    }
    for (const dz of mullions(f.d)) {
      b.box(f.x + xSign * (f.w / 2 + 0.05), h / 2, f.z + dz, 0.1, h, 0.14, band);
    }
    b.box(f.x, h + 0.3, f.z, f.w + 0.4, 0.6, f.d + 0.4, this.m.color('roof'));
    this.parapet(f, 0.4, h + 0.6, 'white');
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
    b.box(f.x, h + 0.15, f.z, f.w + 0.3, 0.3, f.d + 0.3, this.m.color('roof'));
    this.parapet(f, 0.3, h + 0.3, awning);
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
      this.windows(f, floors, 'glass-navy', 0.5, 1);
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
    // Фасад — на видимой стороне по `hidden.z` (BUG-13), как витрины и входы (D13).
    const s = -this.hidden.z as 1 | -1;
    const front = f.z + (s * f.d) / 2;
    b.boxAo(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('stone-light'));
    this.plinth(f);
    b.box(f.x, h + 0.25, f.z, f.w + 0.4, 0.5, f.d + 0.4, this.m.color('roof'));
    // Спереди парапет — волнистый акцентный ниже, поэтому стенки только с трёх сторон.
    this.parapet(f, 0.4, h + 0.5, 'white', s);
    this.cornice(f, h);
    const seg = 6;
    let up = true;
    for (let x = f.x - f.w / 2 + seg / 2; x < f.x + f.w / 2; x += seg) {
      b.box(
        x,
        h + 0.5 + (up ? 0.9 : 0.4),
        front - s * 0.3,
        seg - 0.4,
        up ? 1.8 : 0.8,
        0.5,
        this.m.color(accent),
      );
      up = !up;
    }
    // Ленточное остекление второго этажа по фасаду и торцам.
    this.glass.box(f.x, 8.5, front + s * 0.06, f.w - 4, 2.4, 0.12, this.m.color('glass-teal'));
    this.glass.box(f.x - f.w / 2 - 0.06, 8.5, f.z, 0.12, 2.4, f.d - 4, this.m.color('glass-teal'));
    this.glass.box(f.x + f.w / 2 + 0.06, 8.5, f.z, 0.12, 2.4, f.d - 4, this.m.color('glass-teal'));
    // Портал входа.
    b.boxAo(f.x, 3.5, front + s * 1.2, 12, 7, 2.4, this.m.color('white'));
    this.glass.box(f.x, 2.6, front + s * 2.45, 9, 5, 0.15, this.m.color('glass-blue'));
    b.box(f.x, 7.2, front + s * 1.2, 13, 0.5, 3.2, this.m.color(accent));
    // Вывеска с «буквами».
    b.box(f.x, h + 2.4, front - s * 0.6, 14, 2.2, 0.4, this.m.color('white'));
    for (let i = 0; i < 4; i++) {
      b.box(f.x - 4.5 + i * 3, h + 2.4, front - s * 0.3, 2.0, 1.3, 0.2, this.m.color(accent));
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
    // Антенны, кондиционеры и баки — мелочь: в батч деталей.
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
    // Бочкообразный свод вдоль длинной стороны (BUG-11): цилиндр положен на бок поворотом
    // вокруг Z — ось идёт вдоль X, над корпусом видна верхняя половина высотой `vault`.
    // Прежде `place` поворачивал его только вокруг вертикали, и свод стоял башней до 19,4.
    // Свод на 0.3 короче корпуса: нижняя половина торцевой крышки прячется в корпусе, а не
    // спорит по глубине с торцевой стеной в одной плоскости.
    const vault = 3;
    b.placeRotated(
      Templates.cylinder8,
      f.x,
      h,
      f.z,
      vault,
      f.w - 0.3,
      f.d / 2,
      0,
      0,
      Math.PI / 2,
      this.m.color('roof-red'),
    );
    b.box(f.x, 2.2, f.z + f.d / 2 + 0.3, f.w * 0.8, 0.2, 2, this.m.color('white'));
  }

  /** Торговый лоток с цветной крышей. */
  stall(x: number, z: number, roof: PaletteKey, rot = 0): void {
    const b = this.batch;
    b.boxAo(x, 0.6, z, 2.6, 1.2, 1.6, this.m.color('brick'), rot);
    if (rot === 0) {
      // Ореол AO у лотка (FR-19.12); повёрнутые лотки раскладки не используют.
      this.registerFootprint({ x, z, w: 2.6, d: 1.6 }, 0);
    }
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
    b.box(f.x, h + 0.2, f.z, f.w + 0.4, 0.4, f.d + 0.4, this.m.color('roof'));
    this.parapet(f, 0.4, h + 0.4, 'glass-teal');
    this.cornice(f, h);
    this.windows(f, floors, 'glass-navy', 0.5);
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

  /**
   * Стадион (FR-19.13, AC-19.14, design «Волна 3»): открытая сверху чаша, как у референса.
   * Цоколь-цилиндр 0…6; на нём поле с полосами газона и разметкой, нижний и верхний ярусы
   * трибун наклонными кольцами (цвета флага: голубой и золотой), проход между ними, внешняя
   * стена кольцом и открытое кольцо кровли — раздвижная крыша «Астана Арены». Прежний сплошной
   * диск кровли на высоте 8 закрывал поле и трибуны — сверху стадион читался белым овалом.
   */
  stadium(cx: number, cz: number, rx: number, rz: number): void {
    const b = this.batch;
    const m = this.m;
    // Ореол AO вокруг чаши и её рёбер-опор (FR-19.12): основание — эллипс чуть шире рёбер.
    this.ellipses.push({ cx, cz, rx: rx * 1.02 + 0.3, rz: rz * 1.02 + 0.3 });
    const ring = (k: number, y: number): EllipseRing => ({ rx: rx * k, rz: rz * k, y });
    const stone = m.color('stone-light');
    const white = m.color('white');
    // Цоколь чаши: его верхняя крышка на 6 закрыта полем и ярусами.
    b.place(Templates.cylinder16, cx, 3, cz, rx, 6, rz, stone);
    // Поле: верх на FIELD_TOP; нижний ярус начинается на 0.74 · r — внутри поля, без щели.
    b.place(Templates.cylinder16, cx, 6.55, cz, rx * 0.76, 1.1, rz * 0.76, m.color('grass'));
    this.pitch(cx, cz, rx * 0.76 * 0.7, rz * 0.76 * 0.62);
    // Ярусы: у поля темнее (AO), к проходу — полный цвет.
    b.ellipseBand(
      cx,
      cz,
      ring(0.74, 7.15),
      ring(0.87, 8.7),
      m.shade('flag-blue', 0.75),
      m.color('flag-blue'),
    );
    b.ellipseBand(cx, cz, ring(0.87, 8.7), ring(0.89, 8.7), white, white);
    b.ellipseBand(cx, cz, ring(0.89, 8.7), ring(1, 10.4), m.shade('gold', 0.8), m.color('gold'));
    // Внешняя стена чаши — сверху вниз, чтобы смотрела наружу; продолжает цоколь.
    b.ellipseBand(cx, cz, ring(1, 10.4), ring(1, 6), stone, stone);
    // Открытое кольцо кровли над внешним краем верхнего яруса.
    b.ellipseBand(cx, cz, ring(0.93, 11), ring(1.06, 11), white, white);
    // Внешние рёбра-опоры держат кольцо кровли.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.box(
        cx + Math.cos(a) * rx * 1.02,
        5.6,
        cz + Math.sin(a) * rz * 1.02,
        0.5,
        11.2,
        0.5,
        m.color('steel'),
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
      b.box(cx + mx, 9, cz + mz, 0.5, 18, 0.5, m.color('steel'));
      b.box(cx + mx, 18.5, cz + mz, 3, 1.2, 0.6, white);
    }
  }

  /**
   * Газон и разметка футбольного поля (FR-19.13) в батче деталей: три тёмные полосы стрижки,
   * контур, центральная линия и круг, две штрафные площади. `hw` × `hd` — полуразмеры поля,
   * которое лежит на верхе газона `FIELD_TOP`.
   */
  private pitch(cx: number, cz: number, hw: number, hd: number): void {
    const d = this.detail;
    const white = this.m.color('white');
    const stripe = this.m.shade('grass', 0.9);
    const y = FIELD_TOP + 0.01;
    const lineY = FIELD_TOP + 0.03;
    const w = 0.2;
    const band = (2 * hw) / 6;
    for (const k of [0, 2, 4]) {
      d.plane(cx - hw + band * (k + 0.5), y, cz, band, 2 * hd, stripe);
    }
    // Контур и центральная линия.
    d.box(cx, lineY, cz - hd, 2 * hw, 0.04, w, white);
    d.box(cx, lineY, cz + hd, 2 * hw, 0.04, w, white);
    d.box(cx - hw, lineY, cz, w, 0.04, 2 * hd, white);
    d.box(cx + hw, lineY, cz, w, 0.04, 2 * hd, white);
    d.box(cx, lineY, cz, w, 0.04, 2 * hd, white);
    // Центральный круг — плоское белое кольцо.
    const r = hd * 0.3;
    d.ellipseBand(
      cx,
      cz,
      { rx: r, rz: r, y: lineY + 0.02 },
      { rx: r + w, rz: r + w, y: lineY + 0.02 },
      white,
      white,
    );
    // Штрафные площади у ворот (по короткой стороне поля).
    const depth = hw * 0.18;
    const half = hd * 0.45;
    for (const side of [-1, 1] as const) {
      const gx = cx + side * hw;
      d.box(gx - side * depth, lineY, cz, w, 0.04, 2 * half, white);
      d.box(gx - (side * depth) / 2, lineY, cz - half, depth, 0.04, w, white);
      d.box(gx - (side * depth) / 2, lineY, cz + half, depth, 0.04, w, white);
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

  ground(key: PaletteKey, top?: number, half?: number): void {
    this.groundKey = key;
    this.groundTop = top ?? null;
    this.groundHalf = half ?? null;
  }

  footprint(x: number, z: number, w: number, d: number): void {
    this.registerFootprint({ x, z, w, d }, 0);
  }

  ellipse(cx: number, cz: number, rx: number, rz: number): void {
    this.ellipses.push({ cx, cz, rx, rz });
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
      this.ellipses.length = 0;
      return halos;
    }
    const color = this.m.color(this.groundKey);
    const full = AO.GROUND_WIDTH;
    // Своя плита ландмарка (FR-19.14): ореол ложится на её верх и режется по её краю.
    const haloY = this.groundTop === null ? y : this.groundTop + AO.GROUND_LIFT;
    const edge = this.groundHalf ?? limit;
    for (const e of this.ellipses) {
      // Эллипс не режется по соседям (на квартале он один), только по краю покрытия.
      const wx = Math.max(0, Math.min(full, edge - (Math.abs(e.cx) + e.rx)));
      const wz = Math.max(0, Math.min(full, edge - (Math.abs(e.cz) + e.rz)));
      this.batch.haloEllipse(e.cx, e.cz, e.rx, e.rz, wx, wz, haloY, color, AO.GROUND_MIN);
    }
    this.ellipses.length = 0;
    for (const f of this.footprints) {
      let px = Math.min(full, edge - (f.x + f.w / 2));
      let nx = Math.min(full, f.x - f.w / 2 + edge);
      let pz = Math.min(full, edge - (f.z + f.d / 2));
      let nz = Math.min(full, f.z - f.d / 2 + edge);
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
      this.batch.halo(f.x, f.z, f.w, f.d, haloY, widths, color, AO.GROUND_MIN);
      halos.push({ footprint: f, widths });
    }
    this.footprints.length = 0;
    return halos;
  }

  /**
   * Парапет плоской крыши (FR-19.5, AC-19.5): четыре стенки `boxAo` высотой
   * `ROOF.PARAPET_HEIGHT` и толщиной `ROOF.PARAPET_T` по краю плиты крыши размером
   * `(w + overhang) × (d + overhang)`, внешняя грань заподлицо с краем плиты. Стенки — объём,
   * поэтому строятся на всех сторонах (D13: сверху видна внутренняя грань дальней стенки);
   * низ стенок темнеет у плиты — AO на стыке с кровлей. `skipZ` — сторона по Z, где стенку
   * не ставим (у ТЦ спереди свой волнистый парапет). Бюджет: 4 × 24 = 96 вершин на дом.
   */
  private parapet(
    f: Footprint,
    overhang: number,
    top: number,
    color: PaletteKey,
    skipZ: 1 | -1 | 0 = 0,
  ): void {
    const b = this.batch;
    const c = this.m.color(color);
    const t = ROOF.PARAPET_T;
    const hgt = ROOF.PARAPET_HEIGHT;
    const w = f.w + overhang;
    const d = f.d + overhang;
    const y = top + hgt / 2;
    for (const side of [1, -1] as const) {
      if (side !== skipZ) {
        b.boxAo(f.x, y, f.z + side * (d / 2 - t / 2), w, hgt, t, c);
      }
      b.boxAo(f.x + side * (w / 2 - t / 2), y, f.z, t, hgt, d - 2 * t, c);
    }
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
   * камеры. Мелочь — в батч деталей (`this.detail`).
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
   * стойки — мелочь, в батч деталей (`this.detail`).
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

    // Козырёк на двух стойках — мелочь, батч деталей.
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
   * сторону выбираем по `hidden.z`, как окна (`windows`). Стойки и вывеска с накладкой — мелочь,
   * в батч деталей (`this.detail`).
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
   * Окна отдельными проёмами (FR-19.6, AC-19.6, design «C7 (дополнение, итерация 5)»): на каждом
   * этаже — ряд вертикальных четырёхугольников с шагом `FACADE.WINDOW_STEP` и шириной
   * `WINDOW_STEP × ratio`, по центру фасада, с простенками не меньше `WINDOW_MARGIN` у углов.
   * Строятся только на двух видимых фасадах (design D13, FR-18.1): проёмы на сторонах,
   * смотрящих в мировые −X и −Z, не попадают в кадр ни при какой позиции камеры. Проём —
   * 4 вершины и 2 треугольника против 24 и 12 у прежней ленты-бокса, поэтому отдельные окна
   * дешевле ленты по треугольникам. `skipCenterX` — полуширина центральной зоны боковой
   * стороны без окон (за вертикальной полосой лоджий новостройки проёмов не видно).
   */
  private windows(
    f: Footprint,
    floors: number,
    color: PaletteKey,
    ratio: number,
    fromFloor = 0,
    skipCenterX = 0,
  ): void {
    const b = this.batch;
    const c = this.m.color(color);
    const zSign = -this.hidden.z as 1 | -1;
    const xSign = -this.hidden.x as 1 | -1;
    const width = FACADE.WINDOW_STEP * ratio;
    const height = FLOOR * 0.42;
    const count = (length: number): number =>
      Math.max(1, Math.floor((length - 2 * FACADE.WINDOW_MARGIN) / FACADE.WINDOW_STEP));
    const alongX = count(f.w);
    const alongZ = count(f.d);
    const faceZ = f.z + zSign * (f.d / 2 + FACADE.WINDOW_OFFSET);
    const faceX = f.x + xSign * (f.w / 2 + FACADE.WINDOW_OFFSET);
    // Нормаль шаблона +Z; поворот вокруг Y разворачивает её на видимую сторону.
    const rotZ = zSign > 0 ? 0 : Math.PI;
    const rotX = (xSign * Math.PI) / 2;
    for (let i = fromFloor; i < floors; i++) {
      const y = i * FLOOR + FLOOR * 0.55;
      for (let k = 0; k < alongX; k++) {
        const x = f.x + (k - (alongX - 1) / 2) * FACADE.WINDOW_STEP;
        b.place(Templates.planeXY, x, y, faceZ, width, height, 1, c, rotZ);
      }
      for (let k = 0; k < alongZ; k++) {
        const dz = (k - (alongZ - 1) / 2) * FACADE.WINDOW_STEP;
        if (skipCenterX > 0 && Math.abs(dz) < skipCenterX + width / 2) {
          continue;
        }
        b.place(Templates.planeXY, faceX, y, f.z + dz, width, height, 1, c, rotX);
      }
    }
  }
}

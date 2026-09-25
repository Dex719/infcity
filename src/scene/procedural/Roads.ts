import type { Color } from 'three';
import { CHUNK_LAYOUT, CROSSWALK, WORLD } from '@/config';
import type { Materials } from '@/scene/Materials';
import type { LrtInfo, RoadsInfo } from '@/world/types';
import type { GeometryBatch } from './GeometryBatch';
import type { Props } from './Props';

const HALF = WORLD.CHUNK_SIZE / 2;
const AXIS = CHUNK_LAYOUT.ROAD_AXIS; // −25
const ROAD_W = CHUNK_LAYOUT.ROAD_WIDTH; // 10
const CURB_Y = 0.15;
const MARK_Y = 0.03;
const DASH_LEN = 3;
const DASH_GAP = 3;
// Переходы и стоп-линии (FR-19.27, design D31); вдоль дороги — от края зоны перекрёстка.
/** Проезжая часть обеих дорог поперёк — от внешней полосы тротуара до плиты квартала. */
const CARRIAGE_MIN = -HALF + CHUNK_LAYOUT.SIDEWALK_WIDTH; // −28.5
const CARRIAGE_MAX = AXIS + ROAD_W / 2; // −20
/** Начало зебры у своей зоны (на восток и юг от −20) и у дальнего конца дороги (зона соседа — с +30). */
const ZEBRA_NEAR = CARRIAGE_MAX + CROSSWALK.OFFSET; // −19.7
const ZEBRA_FAR = HALF - CROSSWALK.OFFSET - CROSSWALK.LENGTH; // 27.5
/** Полосы зебры — плоскости чуть ниже верха штрихов (MARK_Y + 0.01): без общих граней с ними. */
const ZEBRA_Y = MARK_Y + 0.005;
/** Начало стоп-линии: у своей зоны — за зеброй, у дальнего конца — перед ней. */
const STOP_NEAR = ZEBRA_NEAR + CROSSWALK.LENGTH + CROSSWALK.STOP_GAP; // −16.7
const STOP_FAR = ZEBRA_FAR - CROSSWALK.STOP_GAP - CROSSWALK.STOP_WIDTH; // 26.2
/** Стоп-линия идёт от оси дороги до этого отступа от бордюра: краевая линия кончается в 0.375. */
const STOP_CURB_CLEARANCE = 0.45;
/** Зазоры осевого пунктира до стоп-линий и краевых линий до зебр. */
const DASH_CLEARANCE = 0.5;
const EDGE_CLEARANCE = 0.3;
const ARROW_STEM_W = 0.25;
const ARROW_STEM_LEN = 2.0;
const ARROW_FEATHER_W = 0.22;
const ARROW_FEATHER_LEN = 0.9;
/**
 * Разворот щитов и секций на камеру. Камера смотрит в (−0.707, −0.707) и не вращается,
 * поэтому плоский щит виден, когда `sin f + cos f > 0`; при `f = −π/4` произведение равно
 * ровно нулю — щит стоит строго ребром и не читается (рецензия 2026-09-19).
 */
const SIGN_FACING = Math.PI / 4;
/** Центр внешней тротуарной полосы `[−30, −28.5]` относительно кромки чанка. */
const OUTER_WALK = CHUNK_LAYOUT.SIDEWALK_WIDTH / 2;

/**
 * Дороги чанка (FR-3.1, FR-3.5, design C7): полотно N–S вдоль западной кромки
 * `x ∈ [−30, −20]`, полотно E–W вдоль северной `z ∈ [−30, −20]`, перекрёсток в NW-углу,
 * тротуары-бордюры вокруг квартала, разметка, зебры, фонари и остановки.
 * Стыковка: полотна упираются в границы чанка ровно на ±30, осевые линии на −25.
 */
export function buildRoads(
  batch: GeometryBatch,
  detail: GeometryBatch,
  props: Props,
  m: Materials,
  roads: RoadsInfo,
  lrt: LrtInfo,
  river = false,
): void {
  const hasLrt = lrt.corridor !== null;
  const asphalt = m.color('asphalt');
  const marking = m.color('marking');
  const sidewalk = m.color('sidewalk');
  const blockMin = AXIS + ROAD_W / 2; // −20
  const blockCenter = (blockMin + HALF) / 2; // 5
  const blockSize = HALF - blockMin; // 50

  if (river) {
    // Русло (FR-14): только полосы дорог — набережная E–W и мост N–S; воду и берега строит квартал.
    batch.plane(0, 0, AXIS, WORLD.CHUNK_SIZE, ROAD_W, asphalt);
    batch.plane(AXIS, 0, 0, ROAD_W, WORLD.CHUNK_SIZE, asphalt);
    // Мост: плита настила под полотном (верх чуть ниже асфальта — без z-fighting),
    // перила по краям, опоры целиком под плитой, фонари на перилах.
    const concrete = m.color('concrete');
    batch.box(AXIS, -0.45, blockCenter, ROAD_W, 0.86, blockSize, concrete);
    const rail = m.color('white');
    for (const x of [AXIS - ROAD_W / 2 + 0.25, AXIS + ROAD_W / 2 - 0.25]) {
      batch.box(x, 0.6, blockCenter, 0.2, 1.2, blockSize, rail);
      batch.box(x, 1.25, blockCenter, 0.3, 0.12, blockSize, m.color('steel'));
    }
    for (let z = blockMin + 6; z < HALF; z += 12) {
      batch.box(AXIS, -1.7, z, ROAD_W - 3, 1.7, 2.0, concrete);
      props.lamp(AXIS - ROAD_W / 2 + 0.9, z, 4.5);
      props.lamp(AXIS + ROAD_W / 2 - 0.9, z, 4.5);
    }
  } else {
    // Полотно: вся площадь чанка — асфальт (перекрывается тротуаром квартала).
    batch.plane(0, 0, 0, WORLD.CHUNK_SIZE, WORLD.CHUNK_SIZE, asphalt);
    // Тротуар-бордюр квартала: x, z ∈ [−20, 30], приподнят.
    batch.box(blockCenter, CURB_Y / 2, blockCenter, blockSize, CURB_Y, blockSize, sidewalk);
  }

  // Тротуары на внешней стороне дорог (у соседних чанков) — узкие полоски у кромки.
  const sw = CHUNK_LAYOUT.SIDEWALK_WIDTH;
  batch.box(-HALF + sw / 2, CURB_Y / 2, blockCenter, sw, CURB_Y, blockSize, sidewalk);
  batch.box(blockCenter, CURB_Y / 2, -HALF + sw / 2, blockSize, CURB_Y, sw, sidewalk);
  batch.box(-HALF + sw / 2, CURB_Y / 2, -HALF + sw / 2, sw, CURB_Y, sw, sidewalk);

  // Разметка — в батч деталей.
  // Осевые прерывистые линии — между стоп-линиями, не заходят на переходы (FR-19.27).
  const dashTo = STOP_FAR - DASH_CLEARANCE;
  for (
    let t = STOP_NEAR + CROSSWALK.STOP_WIDTH + DASH_CLEARANCE;
    t + DASH_LEN <= dashTo;
    t += DASH_LEN + DASH_GAP
  ) {
    const c = t + DASH_LEN / 2;
    if (!hasLrt) {
      detail.box(c, MARK_Y, AXIS, DASH_LEN, 0.02, 0.25, marking); // вдоль E–W
    }
    if (!lrt.ns) {
      detail.box(AXIS, MARK_Y, c, 0.25, 0.02, DASH_LEN, marking); // вдоль N–S
    }
  }
  // Сплошные краевые линии — между зебрами.
  const edgeFrom = ZEBRA_NEAR + CROSSWALK.LENGTH + EDGE_CLEARANCE;
  const edgeTo = ZEBRA_FAR - EDGE_CLEARANCE;
  const edgeCenter = (edgeFrom + edgeTo) / 2;
  const edgeLength = edgeTo - edgeFrom;
  detail.box(edgeCenter, MARK_Y, AXIS - ROAD_W / 2 + 0.3, edgeLength, 0.02, 0.15, marking);
  detail.box(edgeCenter, MARK_Y, AXIS + ROAD_W / 2 - 0.3, edgeLength, 0.02, 0.15, marking);
  detail.box(AXIS - ROAD_W / 2 + 0.3, MARK_Y, edgeCenter, 0.15, 0.02, edgeLength, marking);
  detail.box(AXIS + ROAD_W / 2 - 0.3, MARK_Y, edgeCenter, 0.15, 0.02, edgeLength, marking);

  // Зебры с четырёх сторон перекрёстков, вне их зон (FR-19.27, design D31).
  crosswalks(detail, marking);

  // Стоп-линии перед каждой зеброй, стрелки направления на подъездах (TSK-102, FR-18.2,
  // design «C7 (дополнение): улицы» → «Разметка»; места — FR-19.27, design D31).
  stopLines(detail, marking);
  if (!river) {
    // На русле — мост и набережная, полос с направлением движения к перекрёстку нет.
    laneArrows(detail, marking, blockMin);
  }

  // Фонари вдоль квартала (сторона −z и сторона −x квартала); на русле — только набережная.
  for (let t = blockMin + 6; t < HALF - 3; t += 12) {
    props.lamp(t, blockMin + 0.6);
    if (!river) {
      props.lamp(blockMin + 0.6, t);
    }
  }

  // Вариант 'b': остановка и деревья вдоль тротуара; 'a' — только деревья реже.
  if (roads.ew === 'b') {
    const busX = blockMin + 14;
    const busZ = blockMin + 1.3;
    props.busStop(busX, busZ, 0);
    // Мебель тротуара (TSK-103, design «Мебель тротуара», FR-18.3): урна и скамейка в
    // коридоре между навесом остановки (край на busX + 2) и первым хвойником ряда ниже
    // (busX + 7, шаг 9 при ew = 'b') — запас ≥ 0.3 юнита от обоих.
    props.trashBin(busX + 2.7, busZ);
    props.bench(busX + 5.2, busZ, Math.PI / 2);
  }
  if (roads.ns === 'b' && !river) {
    props.busStop(blockMin + 1.3, blockMin + 34, Math.PI / 2);
    // Велопарковка у тротуара (design «Мебель тротуара»): перед первым хвойником N–S
    // ряда (blockMin + 7 при ns = 'b'), вне зоны фонарей (blockMin + 0.6, t ∈ {−14,…}).
    props.bikeRack(blockMin + 1.1, blockMin + 3, Math.PI / 2);
  }
  // На набережной деревьев нет — только фонари и скамейки (см. BlockPrefabs.river).
  if (!river) {
    const treeStep = roads.ew === 'b' ? 9 : 14;
    for (let t = blockMin + 3; t < HALF - 2; t += treeStep) {
      props.tree(t, blockMin + 1.1, 0.6, 1);
    }
  }
  if (!river) {
    const treeStepNs = roads.ns === 'b' ? 9 : 14;
    for (let t = blockMin + 7; t < HALF - 2; t += treeStepNs) {
      props.tree(blockMin + 1.1, t, 0.6, 1);
    }
  }

  // Перекрёсток: светофоры для варианта 'lights', клумба для 'plaza'.
  if (roads.corner === 'lights') {
    trafficLight(detail, m, blockMin + 0.7, blockMin + 0.7);
    trafficLight(detail, m, -HALF + 0.7, blockMin + 0.7);
    trafficLight(detail, m, blockMin + 0.7, -HALF + 0.7);
    // Мебель перекрёстка (TSK-103, design «Мебель тротуара», FR-18.3, FR-18.4): знаки у
    // двух из трёх стоек светофора (со смещением 0.9 вдоль тротуара от каждой стойки —
    // не задевает ни стойку, ни хвойник ряда ниже), пешеходные светофоры на двух других
    // углах перекрёстка, урна у ближнего угла.
    // Все щиты и секции развёрнуты на камеру (`SIGN_FACING`): камера не вращается, а щит,
    // поставленный ребром к ней, не читается вовсе (рецензия 2026-09-19).
    props.roadSign(blockMin + 1.6, blockMin + 0.7, 0, SIGN_FACING);
    props.trashBin(blockMin + 0.7, blockMin + 1.6);
    // Внешний тротуар занимает [−30, −28.5]: мебель ставится по его центру (−29.25), а не
    // на 1.6 от кромки чанка — иначе стойки стоят на асфальте (рецензия 2026-09-19).
    props.roadSign(-HALF + OUTER_WALK, blockMin + 2.3, 2, SIGN_FACING);
    props.pedestrianLight(blockMin + 2.3, -HALF + OUTER_WALK, SIGN_FACING);
    props.pedestrianLight(-HALF + OUTER_WALK, -HALF + OUTER_WALK, SIGN_FACING);
  } else if (roads.corner === 'plaza') {
    detail.box(AXIS, MARK_Y, AXIS, 3, 0.05, 3, m.color('sand'));
    detail.box(AXIS, 0.35, AXIS, 2.2, 0.6, 2.2, m.color('grass'));
    // Указатель, урна и скамейка — на внешнем тротуаре у перекрёстка. В первой версии они
    // стояли по радиусу 2.2 от центра перекрёстка, то есть ровно в полосах движения
    // (−22.5 и −27.5): машины проезжали сквозь них (рецензия 2026-09-19).
    props.roadSign(-HALF + OUTER_WALK, -HALF + 3.4, 1, SIGN_FACING);
    props.trashBin(-HALF + OUTER_WALK, -HALF + OUTER_WALK);
    props.bench(-HALF + 3.4, -HALF + OUTER_WALK, Math.PI / 2);
  }
}

/**
 * Пешеходные переходы (FR-19.27, design D31): 4 зебры по `CROSSWALK.BARS` полос поперёк всей
 * проезжей части. Две лежат у своей зоны перекрёстка — восточная на дороге E–W и южная на N–S.
 * Две — у дальних концов своих дорог: это западная и северная зебры зон соседей, чья зона
 * начинается на +30. Так все зебры любой зоны лежат вне её и внутри своего чанка.
 */
export function crosswalks(batch: GeometryBatch, color: Color): void {
  for (const start of [ZEBRA_NEAR, ZEBRA_FAR]) {
    zebra(batch, color, start + CROSSWALK.LENGTH / 2, true);
    zebra(batch, color, start + CROSSWALK.LENGTH / 2, false);
  }
}

/** Одна зебра с центром `along` вдоль дороги: `alongX` — дорога E–W (полосы вдоль X) или N–S. */
function zebra(batch: GeometryBatch, color: Color, along: number, alongX: boolean): void {
  const { BARS, BAR_WIDTH, BAR_GAP, LENGTH } = CROSSWALK;
  const span = BARS * BAR_WIDTH + (BARS - 1) * BAR_GAP;
  const first = (CARRIAGE_MIN + CARRIAGE_MAX) / 2 - span / 2 + BAR_WIDTH / 2;
  for (let i = 0; i < BARS; i++) {
    const across = first + i * (BAR_WIDTH + BAR_GAP);
    if (alongX) {
      batch.plane(along, ZEBRA_Y, across, LENGTH, BAR_WIDTH, color);
    } else {
      batch.plane(across, ZEBRA_Y, along, BAR_WIDTH, LENGTH, color);
    }
  }
}

function trafficLight(batch: GeometryBatch, m: Materials, x: number, z: number): void {
  batch.box(x, 2.2, z, 0.2, 4.4, 0.2, m.color('steel'));
  batch.box(x, 4.6, z, 0.5, 1.2, 0.4, m.color('roof-dark'));
  batch.box(x, 4.95, z + 0.21, 0.25, 0.25, 0.02, m.color('accent-red'));
  batch.box(x, 4.6, z + 0.21, 0.25, 0.25, 0.02, m.color('gold'));
  batch.box(x, 4.25, z + 0.21, 0.25, 0.25, 0.02, m.color('grass'));
}

/**
 * Стоп-линии перед зебрами (FR-18.2, FR-19.27, design D31): брус на полосе, которая подъезжает
 * к переходу, от оси дороги до `STOP_CURB_CLEARANCE` от бордюра, с зазором `CROSSWALK.STOP_GAP`
 * до зебры. Полосы — `CHUNK_LAYOUT.LANE_OFFSETS` и правила `mobs/Lanes.ts` (правостороннее
 * движение): E–W дорога — южная полоса `z = −22.5` едет на восток, северная `z = −27.5` на
 * запад; N–S дорога — восточная `x = −22.5` едет на север, западная `x = −27.5` на юг. К своей
 * зоне подъезжают северная полоса E–W (с востока) и восточная N–S (с юга), к зонам соседей на
 * +30 — южная E–W и западная N–S.
 *
 * Первая версия (рецензия 2026-09-19) центрировала брус по оси дороги: он накрывал по
 * половине каждой полосы и читался как брус посреди проезжей части.
 */
export function stopLines(batch: GeometryBatch, color: Color): void {
  const near = STOP_NEAR + CROSSWALK.STOP_WIDTH / 2;
  const far = STOP_FAR + CROSSWALK.STOP_WIDTH / 2;
  // Со стороны внешнего тротуара (−28.5) — до оси дороги; со стороны квартала — от оси до −20.
  const outer: Span = [CARRIAGE_MIN + STOP_CURB_CLEARANCE, AXIS];
  const inner: Span = [AXIS, CARRIAGE_MAX - STOP_CURB_CLEARANCE];
  stopLine(batch, color, near, outer, true); // E–W, северная полоса — на запад
  stopLine(batch, color, far, inner, true); // E–W, южная полоса — на восток
  stopLine(batch, color, near, inner, false); // N–S, восточная полоса — на север
  stopLine(batch, color, far, outer, false); // N–S, западная полоса — на юг
}

/** Отрезок поперёк дороги `[from, to]`. */
type Span = readonly [number, number];

/**
 * Один брус стоп-линии: `along` — его центр вдоль дороги, `across` — отрезок поперёк неё;
 * `alongX` — дорога тянется вдоль X (true) или Z.
 */
function stopLine(
  batch: GeometryBatch,
  color: Color,
  along: number,
  across: Span,
  alongX: boolean,
): void {
  const center = (across[0] + across[1]) / 2;
  const length = across[1] - across[0];
  if (alongX) {
    batch.box(along, MARK_Y, center, CROSSWALK.STOP_WIDTH, 0.02, length, color);
  } else {
    batch.box(center, MARK_Y, along, length, 0.02, CROSSWALK.STOP_WIDTH, color);
  }
}

/**
 * Стрелки направления на подъездах к перекрёстку (FR-18.2, design «Разметка»): по одной
 * на каждый подъезд (E–W и N–S дороги), остриём к перекрёстку. Каждая — стержень плюс два
 * пера-шеврона, развёрнутые от оси стержня на `±45°` через `rotationY` метода `box`.
 */
export function laneArrows(batch: GeometryBatch, color: Color, blockMin: number): void {
  const east = CHUNK_LAYOUT.LANE_OFFSETS[1];
  // Южная полоса E–W дороги (`z = −22.5`) по `mobs/Lanes.ts` едет на ВОСТОК: остриё на +X.
  // Первая версия (рецензия 2026-09-19) направляла эту стрелку на −X, то есть против движения.
  // Центр — в 7.5 от зоны: остриё стрелки северного подъезда — в 2.7 от стоп-линии (D31).
  laneArrow(batch, color, blockMin + 7.5, east, Math.PI / 2);
  // Восточная полоса N–S дороги (`x = −22.5`) едет на север: остриё на −Z.
  laneArrow(batch, color, east, blockMin + 7.5, Math.PI);
}

/** Одна стрелка: `rotationY` — направление остриём вперёд (0 — вдоль +Z, design box()). */
export function laneArrow(
  batch: GeometryBatch,
  color: Color,
  x: number,
  z: number,
  rotationY: number,
): void {
  batch.box(x, MARK_Y, z, ARROW_STEM_W, 0.02, ARROW_STEM_LEN, color, rotationY);
  const tipX = x + Math.sin(rotationY) * (ARROW_STEM_LEN / 2);
  const tipZ = z + Math.cos(rotationY) * (ARROW_STEM_LEN / 2);
  // Перо отодвигается назад от острия на половину своей длины: если центрировать его прямо
  // на острие (первая версия, рецензия 2026-09-19), перья торчат и вперёд, и назад — вместо
  // наконечника получается косой крест.
  for (const side of [1, -1] as const) {
    const angle = rotationY + (side * Math.PI) / 4;
    batch.box(
      tipX - Math.sin(angle) * (ARROW_FEATHER_LEN / 2),
      MARK_Y,
      tipZ - Math.cos(angle) * (ARROW_FEATHER_LEN / 2),
      ARROW_FEATHER_W,
      0.02,
      ARROW_FEATHER_LEN,
      color,
      angle,
    );
  }
}

// `edgeLine` удалён (рецензия 2026-09-19): кромка клалась по краям квартала +X и +Z на
// `MARK_Y` = 0.03, то есть внутри приподнятой тротуарной плиты (верх на `CURB_Y` = 0.15) —
// геометрия не видна ни при каком положении камеры. Кромка проезжей части у бордюра уже
// есть: сплошные краевые линии по обеим сторонам обеих дорог строятся в `buildRoads`.

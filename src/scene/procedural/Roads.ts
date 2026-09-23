import type { Color } from 'three';
import { CHUNK_LAYOUT, WORLD } from '@/config';
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
// Разметка TSK-102 (design «C7 (дополнение): улицы» → «Разметка», FR-18.2).
const STOP_LEN = 4.4; // половина полотна ROAD_W (10)
const STOP_WIDTH = 0.5;
const STOP_GAP = 1.5; // отступ центра стоп-линии от центра зебры — не задевает её полосы (±0.8)
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
  // Осевые прерывистые линии (не в зоне перекрёстка).
  const from = blockMin + 2;
  for (let t = from; t < HALF - DASH_LEN; t += DASH_LEN + DASH_GAP) {
    const c = t + DASH_LEN / 2;
    if (!hasLrt) {
      detail.box(c, MARK_Y, AXIS, DASH_LEN, 0.02, 0.25, marking); // вдоль E–W
    }
    if (!lrt.ns) {
      detail.box(AXIS, MARK_Y, c, 0.25, 0.02, DASH_LEN, marking); // вдоль N–S
    }
  }
  // Сплошные краевые линии.
  detail.box(blockCenter, MARK_Y, AXIS - ROAD_W / 2 + 0.3, blockSize, 0.02, 0.15, marking);
  detail.box(blockCenter, MARK_Y, AXIS + ROAD_W / 2 - 0.3, blockSize, 0.02, 0.15, marking);
  detail.box(AXIS - ROAD_W / 2 + 0.3, MARK_Y, blockCenter, 0.15, 0.02, blockSize, marking);
  detail.box(AXIS + ROAD_W / 2 - 0.3, MARK_Y, blockCenter, 0.15, 0.02, blockSize, marking);

  // Зебры на въездах в перекрёсток (со стороны квартала и со стороны соседей).
  zebra(detail, marking, blockMin + 1.2, AXIS, true);
  zebra(detail, marking, AXIS, blockMin + 1.2, false);
  zebra(detail, marking, -HALF + 1.2, AXIS, true);
  zebra(detail, marking, AXIS, -HALF + 1.2, false);

  // Стоп-линии перед каждой зеброй, стрелки направления на подъездах, кромка бордюра
  // квартала (TSK-102, FR-18.2, design «C7 (дополнение): улицы» → «Разметка»).
  stopLines(detail, marking, blockMin);
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

/** Пешеходная зебра поперёк дороги: `alongX` — полосы тянутся вдоль X (true) или Z. */
function zebra(batch: GeometryBatch, color: Color, cx: number, cz: number, alongX: boolean): void {
  for (let i = -2; i <= 2; i++) {
    const offset = i * 1.6;
    if (alongX) {
      batch.box(cx, MARK_Y, cz + offset, 1.6, 0.02, 0.8, color);
    } else {
      batch.box(cx + offset, MARK_Y, cz, 0.8, 0.02, 1.6, color);
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
 * Стоп-линии перед зебрами перекрёстка (FR-18.2, design «Разметка»). Линия перекрывает
 * ОДНУ полосу — ту, что подъезжает к переходу, — и лежит с той стороны зебры, откуда идёт
 * машина. Полосы берутся из `CHUNK_LAYOUT.LANE_OFFSETS` и правил `mobs/Lanes.ts`
 * (правостороннее движение): E–W дорога — южная полоса `z = −22.5` едет на восток,
 * северная `z = −27.5` на запад; N–S дорога — восточная `x = −22.5` едет на север,
 * западная `x = −27.5` на юг.
 *
 * Первая версия (рецензия 2026-09-19) центрировала брус по оси дороги: он накрывал по
 * половине каждой полосы и читался как брус посреди проезжей части, а две линии из четырёх
 * вообще уезжали за границу чанка (x ≈ −30.3 при границе −30).
 */
export function stopLines(batch: GeometryBatch, color: Color, blockMin: number): void {
  const west = CHUNK_LAYOUT.LANE_OFFSETS[0];
  const east = CHUNK_LAYOUT.LANE_OFFSETS[1];
  // Подъезд с востока по северной полосе (едет на запад): линия восточнее зебры квартала.
  stopLine(batch, color, blockMin + 1.2 + STOP_GAP, west, true);
  // Подъезд с юга по восточной полосе (едет на север): линия южнее зебры квартала.
  stopLine(batch, color, east, blockMin + 1.2 + STOP_GAP, false);
  // Подъезды с запада и с севера: зебры стоят у самой кромки чанка, поэтому линии
  // прижимаются к границе изнутри (иначе геометрия уходит на территорию соседа).
  stopLine(batch, color, -HALF + STOP_WIDTH / 2 + 0.05, east, true);
  stopLine(batch, color, west, -HALF + STOP_WIDTH / 2 + 0.05, false);
}

/**
 * Один брус стоп-линии длиной в полосу (`STOP_LEN` = половина полотна), центр — на оси той
 * полосы, которая перед ним останавливается. `alongX` — дорога тянется вдоль X (true) или Z.
 */
function stopLine(
  batch: GeometryBatch,
  color: Color,
  cx: number,
  cz: number,
  alongX: boolean,
): void {
  if (alongX) {
    batch.box(cx, MARK_Y, cz, STOP_WIDTH, 0.02, STOP_LEN, color);
  } else {
    batch.box(cx, MARK_Y, cz, STOP_LEN, 0.02, STOP_WIDTH, color);
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
  laneArrow(batch, color, blockMin + 5, east, Math.PI / 2);
  // Восточная полоса N–S дороги (`x = −22.5`) едет на север: остриё на −Z.
  laneArrow(batch, color, east, blockMin + 5, Math.PI);
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

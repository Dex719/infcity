import type { LandmarkId } from '@/config';
import type { Materials } from '@/scene/Materials';
import type { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import type { Props } from '@/scene/procedural/Props';
import { buildAbuDhabiPlaza } from './AbuDhabiPlaza';
import { buildAkOrda } from './AkOrda';
import { buildAstanaOpera } from './AstanaOpera';
import { buildBaiterek } from './Baiterek';
import { buildHazretSultan } from './HazretSultan';
import { buildKazMunayGas } from './KazMunayGas';
import { buildKhanShatyr } from './KhanShatyr';
import { buildMegaSilkWay } from './MegaSilkWay';
import { buildNorthernLights } from './NorthernLights';
import { buildNurAlem } from './NurAlem';
import { buildPyramid } from './Pyramid';
import { buildTransportTower } from './TransportTower';

/** Контекст сборки ландмарка в локальной системе квартала (центр (0,0), ±25). */
export interface LandmarkContext {
  readonly opaque: GeometryBatch;
  readonly glass: GeometryBatch;
  readonly props: Props;
  readonly m: Materials;
  readonly rng: () => number;
}

/** Строит ландмарк по идентификатору (FR-4.3–4.6, design C8). */
export function buildLandmark(id: LandmarkId, ctx: LandmarkContext): void {
  switch (id) {
    case 'baiterek':
      buildBaiterek(ctx);
      break;
    case 'khan-shatyr':
      buildKhanShatyr(ctx);
      break;
    case 'nur-alem':
      buildNurAlem(ctx);
      break;
    case 'pyramid':
      buildPyramid(ctx);
      break;
    case 'ak-orda':
      buildAkOrda(ctx);
      break;
    case 'abu-dhabi-plaza':
      buildAbuDhabiPlaza(ctx);
      break;
    case 'astana-opera':
      buildAstanaOpera(ctx);
      break;
    case 'hazret-sultan':
      buildHazretSultan(ctx);
      break;
    case 'mega-silk-way':
      buildMegaSilkWay(ctx);
      break;
    case 'northern-lights':
      buildNorthernLights(ctx);
      break;
    case 'transport-tower':
      buildTransportTower(ctx);
      break;
    case 'kazmunaygas':
      buildKazMunayGas(ctx);
      break;
  }
}

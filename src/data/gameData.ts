import { ClassDef, ClassId } from '../types/game';
import { CLASSES_CORE } from '../shared/universeData';

import loginBackdropImg from '../assets/images/login_apocalypse_backdrop_1792915970415.jpg';
import esperPortraitImg from '../assets/images/class_esper_portrait_1792915972807.jpg';
import vanguardPortraitImg from '../assets/images/class_vanguard_portrait_1792915974925.jpg';
import evolverPortraitImg from '../assets/images/class_evolver_portrait_1792915973284.jpg';

export const LOGIN_BACKDROP_URL = loginBackdropImg;

export const CLASSES_DATA: Record<ClassId, ClassDef> = {
  esper: {
    ...CLASSES_CORE.esper,
    portraitUrl: esperPortraitImg,
  },
  vanguard: {
    ...CLASSES_CORE.vanguard,
    portraitUrl: vanguardPortraitImg,
  },
  evolver: {
    ...CLASSES_CORE.evolver,
    portraitUrl: evolverPortraitImg,
  },
};

export {
  CITADEL_MAP_ID,
  FIRST_HUNTING_MAP_ID,
  RARITY_META,
  SLOT_LABELS,
  ITEMS_CATALOG,
  ALL_ITEMS_LIST,
  MAPS_DATA,
  HUNTING_MAPS_DATA,
  NPCS_DATA,
  QUESTS_DATA,
  expRequiredForLevel,
  computeDerivedStats,
  REPLACEABLE_3D_SLOTS,
} from '../shared/universeData';
export type { ReplaceableAssetSlot } from '../shared/universeData';

import type {
  ComplexityLevel,
  HandballFocusTag,
  MaterialType,
  TrainingPhaseCategory,
  VisibilityLevel
} from '../types/domain';

export const PHASE_CATEGORY_LABELS: Record<TrainingPhaseCategory, string> = {
  WARMUP: 'Aufwärmen / Einstimmung',
  SMALL_GAME: 'Kleines Spiel',
  GOALKEEPER_WARMUP: 'Torwart-Einwerfen',
  GROUND_EXERCISE: 'Grundübung',
  GROUND_GAME: 'Grundspiel',
  TARGET_GAME: 'Zielspiel',
  ATHLETICS_COORDINATION: 'Athletik & Koordination',
  COOL_DOWN: 'Cool-Down / Dehnen'
};

export const FOCUS_TAG_LABELS: Record<HandballFocusTag, string> = {
  OFFENSE_INDIVIDUAL: 'Angriff Individual (1gg1)',
  OFFENSE_GROUP: 'Angriff Kleingruppe (2gg2 / 3gg3)',
  OFFENSE_TEAM: 'Angriff Mannschaftstaktik',
  DEFENSE_INDIVIDUAL: 'Abwehr Individual (1gg1)',
  DEFENSE_GROUP: 'Abwehr Kleingruppe (Kooperation)',
  DEFENSE_6_0: '6:0-Abwehr',
  DEFENSE_5_1: '5:1-Abwehr',
  DEFENSE_3_2_1: '3:2:1-Abwehr',
  FAST_BREAK_1ST_WAVE: 'Tempospiel 1. Welle',
  FAST_BREAK_2ND_WAVE: 'Tempospiel 2. Welle / Schnelle Mitte',
  RETREAT: 'Rückzugsverhalten',
  SHOOTING: 'Wurftraining & Wurfvarianten',
  PASSING_CATCHING: 'Passen, Fangen & Stoßbewegung',
  GOALKEEPER_TECHNIQUE: 'Torwart-Technik & Stellungsspiel'
};

export const COMPLEXITY_LABELS: Record<ComplexityLevel, string> = {
  BASIC: 'Basis / Grundlagen',
  ADVANCED: 'Fortgeschritten',
  PERFORMANCE: 'Leistung / Wettkampf'
};

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  BALL: 'Handbälle',
  BALL_CART: 'Ballwagen',
  CONE: 'Hütchen / Markierungsteller',
  BIBS: 'Leibchen / Parteibänder (Satz)',
  COORDINATION_LADDER: 'Koordinationsleiter',
  SOFT_MAT: 'Weichbodenmatte',
  POLE_AIRBODY: 'Stangen / Air-Body-Dummy',
  VAULTING_BOX: 'Sprungkasten / Langbank',
  TARGET_CORNER: 'Wurfecken / Zielrahmen',
  MINI_GOAL: 'Mini-Tor / Aufsetzrahmen'
};

export const VISIBILITY_LABELS: Record<VisibilityLevel, string> = {
  TEAM: 'Intern (Nur Trainerteam)',
  CLUB: 'Vereinsweit (Alle Vereinstrainer)',
  PUBLIC: 'Öffentlicher Standardkatalog'
};

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Montag', short: 'Mo' },
  { value: 2, label: 'Dienstag', short: 'Di' },
  { value: 3, label: 'Mittwoch', short: 'Mi' },
  { value: 4, label: 'Donnerstag', short: 'Do' },
  { value: 5, label: 'Freitag', short: 'Fr' },
  { value: 6, label: 'Samstag', short: 'Sa' },
  { value: 7, label: 'Sonntag', short: 'So' }
];

// Übungskatalog für die Kraft-Eingabe. Grundlage: docs/literatur/begriffe.md (60 Übungen) plus Marius' eigene Übungen.
// Muskelgruppen für die Zählung harter Sätze pro Woche: Hauptmuskel zählt 1, Mitspieler 0,5 (Pelland/Schoenfeld, Nr. 13).

import type { SessionKind } from '../supabase/functions/_shared/domain';

export const MUSCLES = ['brust', 'ruecken', 'schultern', 'bizeps', 'trizeps', 'quadrizeps', 'beinbeuger_gesaess', 'waden', 'rumpf'] as const;
export type Muscle = (typeof MUSCLES)[number];
export const MUSCLE_LABEL: Record<Muscle, string> = {
  brust: 'Brust',
  ruecken: 'Rücken',
  schultern: 'Schultern',
  bizeps: 'Bizeps',
  trizeps: 'Trizeps',
  quadrizeps: 'Quadrizeps',
  beinbeuger_gesaess: 'Beinbeuger, Gesäß',
  waden: 'Waden',
  rumpf: 'Rumpf',
};

/**
 * load:
 *  - 'gesamt': eingetragenes Gewicht ist die Last (Langhantel, Maschine)
 *  - 'paar': Gewicht je Kurzhantel, Last = 2 x Gewicht
 *  - 'koerper': Körpergewicht plus eingetragenes Gewicht (Bandhilfe negativ, z. B. -32)
 *  - 'ohne': nur Wiederholungen, keine Last (Bauch, Plank)
 */
export type LoadMode = 'gesamt' | 'paar' | 'koerper' | 'ohne';

export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
  also?: Muscle[];
  load: LoadMode;
  custom?: boolean;
}

const E = (id: string, name: string, muscle: Muscle, load: LoadMode, also?: Muscle[]): Exercise => ({ id, name, muscle, load, also });

export const CATALOG: Exercise[] = [
  // Brust und Drücken
  E('bankdruecken', 'Bankdrücken', 'brust', 'gesamt', ['trizeps', 'schultern']),
  E('schraegbank_kh', 'Schrägbankdrücken KH', 'brust', 'paar', ['trizeps', 'schultern']),
  E('bankdruecken_kh', 'Bankdrücken KH', 'brust', 'paar', ['trizeps', 'schultern']),
  E('fliegende_kh', 'Fliegende KH', 'brust', 'paar'),
  E('crossover', 'Kabelzug-Crossover', 'brust', 'gesamt'),
  E('liegestuetz', 'Liegestütz', 'brust', 'koerper', ['trizeps']),
  E('dips', 'Dips', 'brust', 'koerper', ['trizeps']),
  E('military_press_kh', 'Military Press KH', 'schultern', 'paar', ['trizeps']),
  E('military_press', 'Military Press Langhantel', 'schultern', 'gesamt', ['trizeps']),
  E('schulterdruecken_sitzend', 'Schulterdrücken sitzend KH', 'schultern', 'paar', ['trizeps']),
  E('seitheben', 'Seitheben', 'schultern', 'paar'),
  E('seitheben_kabel', 'Seitheben am Kabel', 'schultern', 'gesamt'),
  E('reverse_flys', 'Reverse Flys', 'schultern', 'paar', ['ruecken']),
  E('face_pull', 'Face Pull', 'schultern', 'gesamt', ['ruecken']),
  // Rücken und Ziehen
  E('klimmzug', 'Klimmzüge', 'ruecken', 'koerper', ['bizeps']),
  E('klimmzug_untergriff', 'Klimmzüge Untergriff', 'ruecken', 'koerper', ['bizeps']),
  E('latziehen', 'Latziehen', 'ruecken', 'gesamt', ['bizeps']),
  E('rudern_lh', 'Langhantelrudern', 'ruecken', 'gesamt', ['bizeps']),
  E('rudern_kh', 'Kurzhantelrudern', 'ruecken', 'paar', ['bizeps']),
  E('rudern_kh_einarmig', 'Kurzhantelrudern einarmig', 'ruecken', 'gesamt', ['bizeps']),
  E('rudern_kabel', 'Rudern am Kabel', 'ruecken', 'gesamt', ['bizeps']),
  E('rudern_brustauflage', 'Rudern mit Brustauflage', 'ruecken', 'paar', ['bizeps']),
  E('ueberzuege_kabel', 'Überzüge am Kabel', 'ruecken', 'gesamt'),
  E('schulterheben', 'Schulterheben', 'ruecken', 'paar'),
  // Beine
  E('kniebeuge', 'Kniebeuge', 'quadrizeps', 'gesamt', ['beinbeuger_gesaess']),
  E('frontkniebeuge', 'Frontkniebeuge', 'quadrizeps', 'gesamt', ['beinbeuger_gesaess']),
  E('goblet_squat', 'Goblet Squat', 'quadrizeps', 'gesamt', ['beinbeuger_gesaess']),
  E('beinpresse', 'Beinpresse', 'quadrizeps', 'gesamt', ['beinbeuger_gesaess']),
  E('hackenschmidt', 'Hackenschmidt-Kniebeuge', 'quadrizeps', 'gesamt'),
  E('beinstrecker', 'Beinstrecker', 'quadrizeps', 'gesamt'),
  E('bulgarian_split_squat', 'Bulgarian Split Squat', 'quadrizeps', 'paar', ['beinbeuger_gesaess']),
  E('reverse_lunge', 'Ausfallschritt rückwärts', 'quadrizeps', 'paar', ['beinbeuger_gesaess']),
  E('deficit_reverse_lunge', 'Stepback von der Bank', 'quadrizeps', 'paar', ['beinbeuger_gesaess']),
  E('walking_lunge', 'Ausfallschritte gehend', 'quadrizeps', 'paar', ['beinbeuger_gesaess']),
  E('step_up', 'Aufsteiger', 'quadrizeps', 'paar', ['beinbeuger_gesaess']),
  E('kreuzheben', 'Kreuzheben', 'beinbeuger_gesaess', 'gesamt', ['ruecken']),
  E('rdl', 'Rumänisches Kreuzheben', 'beinbeuger_gesaess', 'gesamt', ['ruecken']),
  E('good_morning', 'Good Mornings', 'beinbeuger_gesaess', 'paar', ['ruecken']),
  E('hip_thrust', 'Hip Thrust', 'beinbeuger_gesaess', 'gesamt'),
  E('glute_bridge', 'Glute Bridge', 'beinbeuger_gesaess', 'gesamt'),
  E('glutes_beinheben', 'Glutes Beinheben', 'beinbeuger_gesaess', 'paar'),
  E('hyperextension', 'Rückenstrecken', 'beinbeuger_gesaess', 'koerper', ['ruecken']),
  E('beinbeuger', 'Beinbeuger', 'beinbeuger_gesaess', 'gesamt'),
  E('nordic_curl', 'Nordic Curl', 'beinbeuger_gesaess', 'ohne'),
  E('wadenpresse', 'Wadenpresse', 'waden', 'gesamt'),
  E('wadenheben', 'Wadenheben stehend', 'waden', 'gesamt'),
  E('wadenheben_sitzend', 'Wadenheben sitzend', 'waden', 'gesamt'),
  // Arme
  E('curls_kh', 'Curls KH', 'bizeps', 'paar'),
  E('curls_lh', 'Langhantel-Curl', 'bizeps', 'gesamt'),
  E('schraegbank_curl', 'Schrägbank-Curl', 'bizeps', 'paar'),
  E('scott_curl', 'Scott-Curl', 'bizeps', 'gesamt'),
  E('hammer_curl', 'Hammer-Curl', 'bizeps', 'paar'),
  E('trizeps_kh', 'Trizeps KH', 'trizeps', 'gesamt'),
  E('trizeps_kabel', 'Trizepsdrücken am Kabel', 'trizeps', 'gesamt'),
  E('trizeps_ueber_kopf', 'Trizepsstrecken über Kopf', 'trizeps', 'gesamt'),
  E('french_press', 'French Press', 'trizeps', 'gesamt'),
  E('enges_bankdruecken', 'Enges Bankdrücken', 'trizeps', 'gesamt', ['brust']),
  // Rumpf
  E('bauch', 'Bauch', 'rumpf', 'ohne'),
  E('beinheben', 'Beinheben', 'rumpf', 'ohne'),
  E('beinheben_haengend', 'Beinheben hängend', 'rumpf', 'ohne'),
  E('crunch_kabel', 'Crunch am Kabel', 'rumpf', 'gesamt'),
  E('plank', 'Unterarmstütz', 'rumpf', 'ohne'),
  E('pallof_press', 'Pallof Press', 'rumpf', 'gesamt'),
  E('holzhacker', 'Holzhacker am Kabel', 'rumpf', 'gesamt'),
  E('farmers_walk', "Farmer's Walk", 'rumpf', 'paar'),
  E('unterer_ruecken', 'Unterer Rücken', 'rumpf', 'ohne'),
  E('dead_hang', 'Passives Hängen', 'rumpf', 'ohne'),
];

const CUSTOM_KEY = 'recomp_custom_exercises_v1';

export function loadCustomExercises(): Exercise[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as Exercise[]) : [];
  } catch {
    return [];
  }
}

export function addCustomExercise(name: string, muscle: Muscle, load: LoadMode): Exercise {
  const list = loadCustomExercises();
  const id = 'eigen_' + name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const ex: Exercise = { id, name: name.trim(), muscle, load, custom: true };
  const rest = list.filter((x) => x.id !== id);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify([...rest, ex]));
  } catch {
    /* Speicher voll */
  }
  return ex;
}

export const allExercises = (): Exercise[] => [...CATALOG, ...loadCustomExercises()];

export function exerciseById(id: string | undefined, list: Exercise[] = allExercises()): Exercise | undefined {
  return id ? list.find((x) => x.id === id) : undefined;
}

/** Freitext (Diktat, alte Einträge) einer Katalogübung zuordnen. */
export function matchExercise(name: string, list: Exercise[] = allExercises()): Exercise | undefined {
  const n = name.toLowerCase().trim();
  return list.find((x) => x.name.toLowerCase() === n) ?? list.find((x) => n.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(n));
}

/** Suche im Katalog: alle Wörter müssen vorkommen. */
export function searchExercises(q: string, list: Exercise[] = allExercises()): Exercise[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((x) => {
    const hay = `${x.name} ${MUSCLE_LABEL[x.muscle]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Vorschlag für die Art der Einheit aus den Muskeln der Übungen. */
export function guessSessionKind(muscles: Muscle[]): SessionKind {
  if (muscles.length <= 1) return 'einzel';
  const push = muscles.filter((m) => m === 'brust' || m === 'schultern' || m === 'trizeps').length;
  const pull = muscles.filter((m) => m === 'ruecken' || m === 'bizeps').length;
  const legs = muscles.filter((m) => m === 'quadrizeps' || m === 'beinbeuger_gesaess' || m === 'waden').length;
  const n = muscles.filter((m) => m !== 'rumpf').length || 1;
  if (legs / n >= 0.6) return 'beine';
  if (push / n >= 0.5 && pull === 0) return 'push';
  if (pull / n >= 0.5 && push === 0) return 'pull';
  if (legs === 0) return 'oberkoerper';
  return push >= pull ? 'push' : 'pull';
}

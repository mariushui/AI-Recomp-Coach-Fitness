// Einheitliche Symbole: einfarbiger Umriss (Phosphor "regular"), Farbe = currentColor.
// Pfade liegen in iconPaths.ts, damit keine Symbol-Bibliothek mitgeladen werden muss.
import React from 'react';
import type { EntryKind, Sport } from '../supabase/functions/_shared/domain';
import { ICON_PATHS, type IconName } from './iconPaths';

export interface IconProps {
  size?: number;
  className?: string;
  weight?: string; // nur für Kompatibilität, es gibt nur den Umriss-Stil
  'aria-hidden'?: boolean;
}
export type IconComponent = React.FC<IconProps>;

const make = (name: IconName): IconComponent => {
  const C: IconComponent = ({ size = 22, className }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
  C.displayName = `Icon${name}`;
  return C;
};

export const SPORT_ICON: Record<Sport, IconComponent> = {
  tennis: make('TennisBall'),
  capoeira: make('PersonSimpleTaiChi'),
  laufen: make('PersonSimpleRun'),
  kraft: make('Barbell'),
  rad: make('PersonSimpleBike'),
  schwimmen: make('PersonSimpleSwim'),
  mobility: make('PersonSimple'),
  sonstiges: make('PersonSimple'),
};

export const KIND_ICON: Record<EntryKind, IconComponent> = {
  meal: make('ForkKnife'),
  workout: make('Barbell'),
  plan: make('CalendarBlank'),
  body: make('Scales'),
  wellbeing: make('Smiley'),
  lab: make('Flask'),
  note: make('NotePencil'),
  health: make('Heartbeat'),
};

/** Symbol für einen Eintrag. Training und Plan zeigen das Symbol der Sportart. */
export const EntryIcon: React.FC<{ kind: EntryKind; data?: any; size?: number; className?: string }> = ({ kind, data, size = 22, className }) => {
  const Cmp = (kind === 'workout' || kind === 'plan') && data?.sport ? SPORT_ICON[data.sport as Sport] ?? KIND_ICON[kind] : KIND_ICON[kind];
  return <Cmp size={size} className={className} />;
};

export const Icons = {
  Plus: make('Plus'),
  Barbell: make('Barbell'),
  Fork: make('ForkKnife'),
  Calendar: make('CalendarBlank'),
  Chart: make('ChartLineUp'),
  Gear: make('Gear'),
  Mic: make('Microphone'),
  Stop: make('Stop'),
  Camera: make('Camera'),
  Image: make('Image'),
  Close: make('X'),
  Check: make('Check'),
  Left: make('CaretLeft'),
  Right: make('CaretRight'),
};

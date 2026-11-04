// Liste zum Umsortieren: Zeile am Griff festhalten und ziehen, oder die Pfeile nutzen.
// Wird im Verlauf (nach langem Drücken) und in den Einstellungen verwendet.
import React, { useRef, useState } from 'react';
import { moveItem } from '../lib/chartPrefs';

const ROW = 52; // Höhe einer Zeile inklusive Abstand, für die Zielposition beim Ziehen

export interface SortItem {
  key: string;
  label: string;
  muted?: boolean; // ausgeblendet, wird blasser gezeigt
}

const SortableList: React.FC<{
  items: SortItem[];
  onChange: (keys: string[]) => void;
  right?: (item: SortItem) => React.ReactNode; // z. B. Häkchen zum Ein- und Ausblenden
}> = ({ items, onChange, right }) => {
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);
  const startY = useRef(0);

  const target = drag ? Math.max(0, Math.min(items.length - 1, drag.index + Math.round(drag.dy / ROW))) : -1;
  const commit = () => {
    if (drag && target !== drag.index) onChange(moveItem<SortItem>(items, drag.index, target).map((i) => i.key));
    setDrag(null);
  };

  return (
    <div className="relative" style={{ height: items.length * ROW }}>
      {items.map((it, i) => {
        // Verschiebung der Zeilen während des Ziehens: die gezogene folgt dem Finger, die anderen rücken nach
        let y = i * ROW;
        if (drag) {
          if (i === drag.index) y = i * ROW + drag.dy;
          else if (drag.index < i && i <= target) y = (i - 1) * ROW;
          else if (target <= i && i < drag.index) y = (i + 1) * ROW;
        }
        const active = drag?.index === i;
        return (
          <div
            key={it.key}
            className={`absolute inset-x-0 flex items-center gap-2 rounded-xl border px-2 ${active ? 'z-10 border-cyber-purple bg-cyber-gray shadow-lg' : 'border-white/5 bg-cyber-black/60'} ${it.muted ? 'opacity-50' : ''}`}
            style={{ height: ROW - 6, transform: `translateY(${y}px)`, transition: active ? 'none' : 'transform 150ms ease-out' }}
          >
            <span
              className="flex h-full w-9 shrink-0 cursor-grab items-center justify-center text-slate-500"
              style={{ touchAction: 'none' }}
              aria-hidden
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                startY.current = e.clientY;
                setDrag({ index: i, dy: 0 });
              }}
              onPointerMove={(e) => drag?.index === i && setDrag({ index: i, dy: e.clientY - startY.current })}
              onPointerUp={commit}
              onPointerCancel={() => setDrag(null)}
            >
              ☰
            </span>
            <span className="flex-1 min-w-0 truncate text-sm text-slate-200">{it.label}</span>
            <button type="button" onClick={() => i > 0 && onChange(moveItem<SortItem>(items, i, i - 1).map((x) => x.key))} disabled={i === 0} className="px-1.5 text-slate-500 disabled:opacity-20" aria-label={`${it.label} nach oben`}>
              ▲
            </button>
            <button type="button" onClick={() => i < items.length - 1 && onChange(moveItem<SortItem>(items, i, i + 1).map((x) => x.key))} disabled={i === items.length - 1} className="px-1.5 text-slate-500 disabled:opacity-20" aria-label={`${it.label} nach unten`}>
              ▼
            </button>
            {right?.(it)}
          </div>
        );
      })}
    </div>
  );
};

export default SortableList;

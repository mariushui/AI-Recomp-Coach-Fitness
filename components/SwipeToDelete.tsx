// Wischen nach links legt einen roten Löschen-Knopf frei, wie in iOS-Listen.
// Mit onSwap legt Wischen nach rechts links einen zweiten Knopf frei, z. B. Tauschen.
// Tippen auf den Inhalt, solange der Knopf offen ist, schließt ihn nur.
import React, { useRef, useState } from 'react';

const BUTTON_W = 96;

const SwipeToDelete: React.FC<{ onDelete: () => void; label?: string; children: React.ReactNode; className?: string; onSwap?: () => void; swapLabel?: string; bg?: string }> = ({
  onDelete,
  label = 'Löschen',
  children,
  className = '',
  onSwap,
  swapLabel = 'Tauschen',
  bg = 'bg-cyber-black',
}) => {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const horizontal = useRef<boolean | null>(null);
  const moved = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: x };
    horizontal.current = null;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (horizontal.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horizontal.current = Math.abs(dx) > Math.abs(dy);
    if (!horizontal.current) return;
    moved.current = true;
    setDragging(true);
    setX(Math.min(onSwap ? BUTTON_W * 1.4 : 0, Math.max(-BUTTON_W * 1.4, start.current.base + dx)));
  };
  const onTouchEnd = () => {
    if (horizontal.current) setX((cur) => (cur < -BUTTON_W / 2 ? -BUTTON_W : cur > BUTTON_W / 2 ? BUTTON_W : 0));
    setDragging(false);
    start.current = null;
  };
  // Klicks nach einem Wisch oder bei offenem Knopf nicht an den Inhalt durchreichen
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current || x !== 0) {
      e.stopPropagation();
      e.preventDefault();
      moved.current = false;
      if (x !== 0) setX(0);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <button
        type="button"
        onClick={() => {
          setX(0);
          onDelete();
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-[#FF375F] text-white text-sm font-bold"
        style={{ width: BUTTON_W, visibility: x < 0 ? 'visible' : 'hidden' }}
        aria-label={label}
        tabIndex={x === 0 ? -1 : 0}
      >
        {label}
      </button>
      {onSwap && (
        <button
          type="button"
          onClick={() => {
            setX(0);
            onSwap();
          }}
          className="absolute inset-y-0 left-0 flex items-center justify-center bg-cyber-purple text-white text-sm font-bold"
          style={{ width: BUTTON_W, visibility: x > 0 ? 'visible' : 'hidden' }}
          aria-label={swapLabel}
          tabIndex={x === 0 ? -1 : 0}
        >
          {swapLabel}
        </button>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
        className={`relative ${bg}`}
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 180ms ease-out', touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeToDelete;

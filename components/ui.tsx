import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl bg-cyber-gray border border-white/5 p-4 ${className}`}>{children}</div>
);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'green' };

export const Button: React.FC<BtnProps> = ({ variant = 'primary', className = '', ...rest }) => {
  const styles = {
    primary: 'bg-cyber-purple text-white hover:opacity-90',
    green: 'bg-cyber-green text-cyber-black hover:opacity-90',
    ghost: 'bg-white/5 text-slate-200 hover:bg-white/10',
    danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25',
  }[variant];
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-3 text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
};

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{children}</span>
);

const inputCls =
  'w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple';

export const TextField: React.FC<{
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  multiline?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, multiline, placeholder }) => (
  <label className="block">
    <Label>{label}</Label>
    {multiline ? (
      <textarea
        className={`${inputCls} min-h-[72px]`}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    ) : (
      <input
        className={inputCls}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    )}
  </label>
);

export const NumberField: React.FC<{
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  unit?: string;
}> = ({ label, value, onChange, step = 1, unit }) => (
  <label className="block">
    <Label>
      {label}
      {unit ? ` (${unit})` : ''}
    </Label>
    <input
      className={inputCls}
      type="number"
      inputMode="decimal"
      step={step}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.');
        const n = Number(v);
        onChange(v === '' || !Number.isFinite(n) ? undefined : n);
      }}
    />
  </label>
);

export const SelectField: React.FC<{
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
  allowEmpty?: boolean;
}> = ({ label, value, options, onChange, allowEmpty = true }) => (
  <label className="block">
    <Label>{label}</Label>
    <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowEmpty && <option value="">–</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

/** Skala 1-5 als Tasten. Nochmal tippen entfernt den Wert. */
export const ScaleField: React.FC<{
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  low?: string;
  high?: string;
}> = ({ label, value, onChange, low, high }) => (
  <div>
    <Label>{label}</Label>
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          onClick={() => onChange(value === n ? undefined : n)}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
            value === n ? 'bg-cyber-purple text-white' : 'bg-cyber-black border border-white/10 text-slate-400'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
    {(low || high) && (
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    )}
  </div>
);

export const ErrorBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm px-3 py-2">{children}</div>
);

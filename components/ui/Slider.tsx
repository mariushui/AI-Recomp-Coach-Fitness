
import React from 'react';

interface SliderProps {
  label: string;
  id: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
}

const Slider: React.FC<SliderProps> = ({ label, id, value, onChange, min = 1, max = 10, step = 1 }) => {
  return (
    <div className="group">
      <div className="flex justify-between items-center mb-2">
        <label htmlFor={id} className="text-[10px] font-black uppercase tracking-widest text-cyber-purple group-focus-within:text-cyber-green transition-colors">{label}</label>
        <span className="font-black italic text-cyber-green text-xl text-glow-green">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className="w-full h-3 bg-cyber-black/50 border border-cyber-purple/20 rounded-full appearance-none cursor-pointer accent-cyber-purple"
      />
      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          background: #ADFF2F;
          cursor: pointer;
          border-radius: 50%;
          border: 4px solid #8B5CF6;
          box-shadow: 0 0 10px rgba(173, 255, 47, 0.5);
        }
      `}</style>
    </div>
  );
};

export default Slider;

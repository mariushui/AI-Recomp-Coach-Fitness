
import React from 'react';

interface ToggleProps {
  label: string;
  id: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  optionLabels?: [string, string];
}

const Toggle: React.FC<ToggleProps> = ({ label, id, enabled, onChange, optionLabels = ['Yes', 'No'] }) => {
  return (
    <div className="flex flex-col group">
        <span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-cyber-purple group-hover:text-cyber-green transition-colors">{label}</span>
        <label htmlFor={id} className="inline-flex items-center cursor-pointer">
            <div className="relative">
                <input 
                    type="checkbox" 
                    id={id} 
                    className="sr-only peer" 
                    checked={enabled} 
                    onChange={(e) => onChange(e.target.checked)}
                />
                <div className="w-16 h-8 bg-cyber-black border border-cyber-purple/30 rounded-full peer peer-checked:bg-cyber-purple/20 transition-all"></div>
                <div className={`
                    absolute top-1 left-[4px] rounded-full h-6 w-6 transition-all duration-300 shadow-[0_0_10px_rgba(0,0,0,0.5)]
                    ${enabled ? 'translate-x-8 bg-cyber-green shadow-[0_0_15px_#ADFF2F]' : 'bg-cyber-purple/50'}
                `}></div>
            </div>
            <span className={`ml-4 text-sm font-black italic uppercase tracking-wider transition-colors ${enabled ? 'text-cyber-green' : 'text-slate-500'}`}>
                {enabled ? optionLabels[0] : optionLabels[1]}
            </span>
        </label>
    </div>
  );
};

export default Toggle;

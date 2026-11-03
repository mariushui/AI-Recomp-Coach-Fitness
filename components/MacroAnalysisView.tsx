
import React from 'react';
import type { MacroAnalysis } from '../types';

interface MacroAnalysisViewProps {
  macros: MacroAnalysis | null;
  isLoading: boolean;
  t: (key: string) => string;
}

const MacroAnalysisView: React.FC<MacroAnalysisViewProps> = ({ macros, isLoading, t }) => {
  if (isLoading) {
    return (
      <div className="bg-cyber-black/40 rounded-2xl p-6 animate-pulse border border-cyber-purple/20">
        <div className="h-4 bg-cyber-purple/20 rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-cyber-purple/10 rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  if (!macros) return null;

  return (
    <div className="bg-cyber-black/60 rounded-2xl p-6 border border-cyber-green/20 shadow-[0_0_20px_rgba(173,255,47,0.05)] animate-fade-in mt-6">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyber-green">SCAN: {t('macroAnalysis')}</h4>
        <span className={`text-[10px] px-2 py-1 rounded font-black uppercase italic tracking-tighter ${
          macros.confidence === 'high' ? 'bg-cyber-green text-cyber-black' : 
          macros.confidence === 'medium' ? 'bg-cyber-purple text-white' : 'bg-cyber-orange text-white'
        }`}>
          {macros.confidence} CONFIDENCE
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { l: t('calories'), v: macros.calories, c: 'text-white' },
          { l: t('protein'), v: `${macros.protein}g`, c: 'text-cyber-green', glow: true },
          { l: t('carbs'), v: `${macros.carbs}g`, c: 'text-white' },
          { l: t('fat'), v: `${macros.fat}g`, c: 'text-white' }
        ].map((item, i) => (
          <div key={i} className={`text-center p-3 bg-cyber-purple/5 border border-cyber-purple/10 rounded-xl ${item.glow ? 'border-cyber-green/30' : ''}`}>
            <div className="text-[8px] font-black text-cyber-purple uppercase mb-1">{item.l}</div>
            <div className={`text-xl font-black italic tracking-tighter ${item.c}`}>{item.v}</div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-cyber-purple/40 italic text-center font-bold uppercase tracking-widest">
        {t('macroDisclaimer')}
      </p>
    </div>
  );
};

export default MacroAnalysisView;

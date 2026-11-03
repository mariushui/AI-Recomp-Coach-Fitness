
import React from 'react';
import type { DietData, MacroAnalysis } from '../types';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import MacroAnalysisView from './MacroAnalysisView';

interface DietSectionProps {
  data: DietData;
  handleChange: (section: 'diet', field: keyof DietData, value: string) => void;
  t: (key: string) => string;
  macros: MacroAnalysis | null;
  isEstimatingMacros: boolean;
}

const DietSection: React.FC<DietSectionProps> = ({ data, handleChange, t, macros, isEstimatingMacros }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input 
          label={t('hydration')} 
          id="hydration"
          type="number"
          value={data.hydration}
          onChange={(e) => handleChange('diet', 'hydration', e.target.value)}
        />
        <Input 
          label={t('supplements')} 
          id="supplements"
          value={data.supplements}
          onChange={(e) => handleChange('diet', 'supplements', e.target.value)}
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Textarea 
          label={t('breakfast')} 
          id="breakfast"
          value={data.breakfast}
          onChange={(e) => handleChange('diet', 'breakfast', e.target.value)}
          rows={2}
        />
        <Textarea 
          label={t('lunch')} 
          id="lunch"
          value={data.lunch}
          onChange={(e) => handleChange('diet', 'lunch', e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Textarea 
          label={t('snacks')} 
          id="snacks"
          value={data.snacks}
          onChange={(e) => handleChange('diet', 'snacks', e.target.value)}
          rows={2}
        />
        <Textarea 
          label={t('dinner')} 
          id="dinner"
          value={data.dinner}
          onChange={(e) => handleChange('diet', 'dinner', e.target.value)}
          rows={2}
        />
      </div>

      <MacroAnalysisView 
        macros={macros} 
        isLoading={isEstimatingMacros} 
        t={t} 
      />
    </div>
  );
};

export default DietSection;

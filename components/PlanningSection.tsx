
import React from 'react';
import type { PlanningData } from '../types';
import Input from './ui/Input';

interface PlanningSectionProps {
  data: PlanningData;
  handleChange: (section: 'planning', field: keyof PlanningData, value: string) => void;
  t: (key: string) => string;
}

const PlanningSection: React.FC<PlanningSectionProps> = ({ data, handleChange, t }) => {
  return (
    <div className="space-y-4">
      <Input 
        label={t('plannedActivity')} 
        id="plannedActivity"
        value={data.activity}
        onChange={(e) => handleChange('planning', 'activity', e.target.value)}
      />
      <Input 
        label={t('estimatedDuration')} 
        id="estimatedDuration"
        value={data.duration}
        onChange={(e) => handleChange('planning', 'duration', e.target.value)}
      />
      <Input 
        label={t('goalFocus')} 
        id="goalFocus"
        value={data.focus}
        onChange={(e) => handleChange('planning', 'focus', e.target.value)}
      />
    </div>
  );
};

export default PlanningSection;

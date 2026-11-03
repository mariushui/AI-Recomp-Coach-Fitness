
import React from 'react';
import type { BodyMetrics } from '../types';
import Input from './ui/Input';

interface MetricsSectionProps {
  data: BodyMetrics;
  handleChange: (section: 'metrics', field: keyof BodyMetrics, value: string) => void;
  t: (key: string) => string;
}

const MetricsSection: React.FC<MetricsSectionProps> = ({ data, handleChange, t }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Input 
        label={t('weightLabel')} 
        id="weight"
        type="number"
        step="0.1"
        value={data.weight}
        onChange={(e) => handleChange('metrics', 'weight', e.target.value)}
        placeholder="e.g. 82.5"
      />
      <Input 
        label={t('bodyFatLabel')} 
        id="bodyFat"
        type="number"
        step="0.1"
        value={data.bodyFat}
        onChange={(e) => handleChange('metrics', 'bodyFat', e.target.value)}
        placeholder="e.g. 15.2"
      />
    </div>
  );
};

export default MetricsSection;

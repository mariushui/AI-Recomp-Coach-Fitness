
import React from 'react';
import type { RecoveryData } from '../types';
import Slider from './ui/Slider';
import Input from './ui/Input';

interface RecoverySectionProps {
  data: RecoveryData;
  handleChange: (section: 'recovery', field: keyof RecoveryData, value: string | number) => void;
  t: (key: string) => string;
}

const RecoverySection: React.FC<RecoverySectionProps> = ({ data, handleChange, t }) => {
  const sliders: { key: keyof RecoveryData, labelKey: string }[] = [
    { key: 'general', labelKey: 'generalRecovery' },
    { key: 'muscleSoreness', labelKey: 'muscleSoreness' },
    { key: 'jointPain', labelKey: 'jointTendonPain' },
    { key: 'sleepQuality', labelKey: 'sleepQuality' },
    { key: 'mood', labelKey: 'mood' },
    { key: 'concentration', labelKey: 'concentration' },
    { key: 'appetite', labelKey: 'appetite' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
      {sliders.map(({ key, labelKey }) => (
        <Slider
          key={key}
          label={t(labelKey)}
          id={key}
          value={data[key] as number}
          onChange={(e) => handleChange('recovery', key, parseInt(e.target.value))}
        />
      ))}
      <div className="md:col-span-2 pt-4">
        <Input 
            label={t('emotion')} 
            id="emotion"
            value={data.emotion}
            onChange={(e) => handleChange('recovery', 'emotion', e.target.value)}
            placeholder="e.g. Focused, happy, stressed"
        />
      </div>
    </div>
  );
};

export default RecoverySection;

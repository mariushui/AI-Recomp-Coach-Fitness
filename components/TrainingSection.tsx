
import React from 'react';
import type { TrainingData, Exercise } from '../types';
import Input from './ui/Input';
import Slider from './ui/Slider';
import Toggle from './ui/Toggle';
import WorkoutLogSection from './WorkoutLogSection';

interface TrainingSectionProps {
  data: TrainingData;
  handleChange: (section: 'training', field: keyof TrainingData, value: any) => void;
  t: (key: string) => string;
}

const TrainingSection: React.FC<TrainingSectionProps> = ({ data, handleChange, t }) => {
  const handleExercisesChange = (exercises: Exercise[]) => {
    handleChange('training', 'exercises', exercises);
  };

  return (
    <div className="space-y-8">
      <Toggle
        label={t('didYouTrain')}
        id="trained"
        enabled={data.trained}
        onChange={(value) => handleChange('training', 'trained', value)}
        optionLabels={[t('yes'), t('no')]}
      />
      {data.trained && (
        <div className="space-y-8 border-l-4 border-cyber-purple pl-6 animate-fade-in">
          <Input 
            label={t('trainingType')} 
            id="trainingType"
            value={data.type}
            onChange={(e) => handleChange('training', 'type', e.target.value)}
            placeholder="e.g. Upper Body, Leg Day"
          />
          <Slider
            label={t('rpe')}
            id="rpe"
            value={data.rpe}
            onChange={(e) => handleChange('training', 'rpe', parseInt(e.target.value))}
          />
          
          <div className="pt-6">
            <WorkoutLogSection 
              exercises={data.exercises || []} 
              onChange={handleExercisesChange} 
              t={t} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingSection;

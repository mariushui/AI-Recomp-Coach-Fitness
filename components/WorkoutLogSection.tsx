
import React from 'react';
import type { Exercise } from '../types';
import Input from './ui/Input';

interface WorkoutLogSectionProps {
  exercises: Exercise[];
  onChange: (exercises: Exercise[]) => void;
  t: (key: string) => string;
}

const WorkoutLogSection: React.FC<WorkoutLogSectionProps> = ({ exercises, onChange, t }) => {
  const addExercise = () => {
    onChange([...exercises, { 
      name: '', 
      type: 'strength', 
      weight: '', 
      weightType: 'kg', 
      sets: 0, 
      reps: 0, 
      duration: '', 
      rpe: 5, 
      notes: '' 
    }]);
  };

  const removeExercise = (index: number) => {
    onChange(exercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index: number, field: keyof Exercise, value: any) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-black italic uppercase text-white tracking-tighter">{t('workoutLog')}</h4>
        <button
          type="button"
          onClick={addExercise}
          className="text-[10px] font-black uppercase tracking-widest bg-cyber-green text-cyber-black px-4 py-2 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(173,255,47,0.3)] flex items-center"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
          {t('addExercise')}
        </button>
      </div>

      <div className="space-y-6">
        {exercises.map((ex, index) => (
          <div key={index} className="p-6 bg-cyber-black/40 rounded-2xl border border-cyber-purple/20 relative animate-fade-in group hover:border-cyber-purple/50 transition-all">
            <button
              type="button"
              onClick={() => removeExercise(index)}
              className="absolute -top-3 -right-3 bg-cyber-orange text-cyber-black p-1.5 rounded-full hover:scale-110 transition-all shadow-lg z-10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
              <div className="md:col-span-5">
                <Input
                  label={t('exerciseName')}
                  id={`name-${index}`}
                  value={ex.name}
                  onChange={(e) => updateExercise(index, 'name', e.target.value)}
                  placeholder="e.g. Bench Press"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block mb-2 text-[10px] font-black uppercase tracking-widest text-cyber-purple">{t('exerciseType')}</label>
                <select
                  value={ex.type}
                  onChange={(e) => updateExercise(index, 'type', e.target.value)}
                  className="bg-cyber-black/50 border border-cyber-purple/30 text-white text-sm font-bold rounded-xl focus:ring-2 focus:ring-cyber-green block w-full p-3.5 transition-all outline-none appearance-none"
                >
                  <option value="strength">{t('strength')}</option>
                  <option value="cardio">{t('cardio')}</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Input
                  label={t('durationLabel')}
                  id={`duration-${index}`}
                  value={ex.duration}
                  onChange={(e) => updateExercise(index, 'duration', e.target.value)}
                  placeholder="20"
                />
              </div>
              <div className="md:col-span-2">
                 <Input
                    label={t('exerciseRpe')}
                    id={`exrpe-${index}`}
                    type="number"
                    min="1"
                    max="10"
                    value={ex.rpe}
                    onChange={(e) => updateExercise(index, 'rpe', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            
            {ex.type === 'strength' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 animate-fade-in">
                <Input label={t('weight')} id={`weight-${index}`} value={ex.weight} onChange={(e) => updateExercise(index, 'weight', e.target.value)} placeholder="20" />
                <Input label={t('weightType')} id={`type-${index}`} value={ex.weightType} onChange={(e) => updateExercise(index, 'weightType', e.target.value)} placeholder="kg" />
                <Input label={t('sets')} id={`sets-${index}`} type="number" value={ex.sets} onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value) || 0)} />
                <Input label={t('reps')} id={`reps-${index}`} type="number" value={ex.reps} onChange={(e) => updateExercise(index, 'reps', parseInt(e.target.value) || 0)} />
              </div>
            )}

            <Input
               label={t('remarks')}
               id={`notes-${index}`}
               value={ex.notes}
               onChange={(e) => updateExercise(index, 'notes', e.target.value)}
               placeholder="Notes..."
            />
          </div>
        ))}
        {exercises.length === 0 && (
          <p className="text-center text-cyber-purple/40 text-xs font-black italic uppercase py-8 border-2 border-dashed border-cyber-purple/10 rounded-2xl">Awaiting Exercise Input...</p>
        )}
      </div>
    </div>
  );
};

export default WorkoutLogSection;

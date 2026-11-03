
import React from 'react';
import type { DailyCheckinData, Language, MacroAnalysis } from '../types';
import MetricsSection from './MetricsSection';
import DietSection from './DietSection';
import TrainingSection from './TrainingSection';
import RecoverySection from './RecoverySection';
import PlanningSection from './PlanningSection';
import Textarea from './ui/Textarea';
import Button from './ui/Button';

interface DailyCheckinFormProps {
    formData: DailyCheckinData;
    handleFormChange: (section: keyof DailyCheckinData, field: any, value: any) => void;
    handleSubmit: (e: React.FormEvent) => void;
    isLoading: boolean;
    language: Language;
    t: (key: string) => string;
    macros: MacroAnalysis | null;
    isEstimatingMacros: boolean;
}

const CyberCard: React.FC<{ title: string, children: React.ReactNode, icon: string, statusColor?: string }> = ({ title, children, icon, statusColor = "bg-cyber-green" }) => (
    <div className="bg-cyber-gray rounded-3xl border border-cyber-purple/20 sport-shadow overflow-hidden transition-all hover:border-cyber-purple/50 mb-12">
        <div className="flex items-center justify-between p-6 border-b border-cyber-purple/10 bg-cyber-purple/5">
            <div className="flex items-center space-x-3">
                <span className="text-xl">{icon}</span>
                <h3 className="text-lg font-black italic uppercase tracking-tighter text-white">{title}</h3>
            </div>
            <div className="flex space-x-2">
                <div className={`w-2 h-2 rounded-full ${statusColor} shadow-[0_0_8px_currentColor]`}></div>
                <div className="w-2 h-2 rounded-full bg-cyber-purple/30"></div>
            </div>
        </div>
        <div className="p-8 space-y-6">
          {children}
        </div>
    </div>
);

const DailyCheckinForm: React.FC<DailyCheckinFormProps> = ({ 
    formData, 
    handleFormChange, 
    handleSubmit, 
    isLoading, 
    t, 
    macros, 
    isEstimatingMacros 
}) => {
  return (
    <form onSubmit={handleSubmit} className="pb-12">
      <CyberCard title={t('bodyMetrics')} icon="⚡">
        <MetricsSection data={formData.metrics} handleChange={handleFormChange as any} t={t} />
      </CyberCard>

      <CyberCard title={t('diet')} icon="🥗">
        <DietSection 
            data={formData.diet} 
            handleChange={handleFormChange as any} 
            t={t} 
            macros={macros}
            isEstimatingMacros={isEstimatingMacros}
        />
      </CyberCard>

      <CyberCard title={`${t('training')} & ${t('recovery')}`} icon="🔥">
        <div className="space-y-10">
            <TrainingSection data={formData.training} handleChange={handleFormChange as any} t={t} />
            <div className="pt-8 border-t border-cyber-purple/10">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyber-purple mb-6">{t('recovery')} Status</h4>
                <RecoverySection data={formData.recovery} handleChange={handleFormChange as any} t={t} />
            </div>
        </div>
      </CyberCard>

      <CyberCard title={`${t('planning')} & ${t('remarks')}`} icon="📅">
        <PlanningSection data={formData.planning} handleChange={handleFormChange as any} t={t} />
        <div className="pt-8 border-t border-cyber-purple/10">
            <Textarea
              label={t('remarks').toUpperCase()}
              id="remarks"
              value={formData.remarks}
              onChange={(e) => handleFormChange('remarks', '', e.target.value)}
              placeholder="Additional mission notes..."
            />
        </div>
      </CyberCard>
      
      <div className="bg-cyber-purple/5 p-2 rounded-3xl border-2 border-dashed border-cyber-purple/20">
        <Button type="submit" isLoading={isLoading}>
          {t('submitButton')}
        </Button>
      </div>
    </form>
  );
};

export default DailyCheckinForm;

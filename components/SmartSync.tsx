
import React, { useState } from 'react';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import type { DailyCheckinData } from '../types';
import { parseHealthData } from '../services/geminiService';

interface SmartSyncProps {
  onDataParsed: (data: DailyCheckinData) => void;
  t: (key: string) => string;
}

const SmartSync: React.FC<SmartSyncProps> = ({ onDataParsed, t }) => {
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSync = async () => {
    if (!rawText.trim()) return;
    
    setIsProcessing(true);
    setShowSuccess(false);
    try {
      const parsedData = await parseHealthData(rawText);
      onDataParsed(parsedData);
      setShowSuccess(true);
      setRawText('');
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to parse sync data", error);
      alert(t('errorMessage'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative overflow-hidden bg-cyber-gray p-8 rounded-3xl border border-cyber-purple/20 sport-shadow group transition-all hover:border-cyber-purple/40">
      <div className="absolute top-0 right-0 p-4">
        <span className="flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-green opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyber-green"></span>
        </span>
      </div>
      
      <div className="flex items-center space-x-4 mb-6">
        <div className="bg-cyber-purple/10 p-3 rounded-xl text-cyber-purple border border-cyber-purple/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </div>
        <div>
          <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">{t('smartSyncTitle')}</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyber-purple/60">{t('smartSyncDesc')}</p>
        </div>
      </div>

      <div className="space-y-6">
        <Textarea 
          label="" 
          id="sync-input" 
          placeholder="PASTE HEALTH DATA HERE (JSON/TEXT)..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={4}
          className="bg-cyber-black text-white border-cyber-purple/30 focus:border-cyber-green focus:ring-cyber-green"
        />
        <Button onClick={handleSync} isLoading={isProcessing}>
          {isProcessing ? t('syncing') : t('syncButton')}
        </Button>
        {showSuccess && (
          <p className="text-cyber-green text-xs font-black italic uppercase tracking-widest animate-bounce flex items-center justify-center pt-2">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            {t('syncSuccess')}
          </p>
        )}
      </div>
    </div>
  );
};

export default SmartSync;

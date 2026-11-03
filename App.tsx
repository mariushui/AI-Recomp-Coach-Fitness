
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PlusCircle, 
  BarChart3, 
  Database, 
  Cpu, 
  Settings, 
  Globe, 
  Activity,
  History,
  Zap,
  ChevronRight,
  CloudLightning
} from 'lucide-react';
import type { DailyCheckinData, Language, MacroAnalysis } from './types';
import { translations } from './constants/translations';
import { getCoachingAdvice, estimateMacros } from './services/geminiService';
import { syncToCloud, fetchFromCloud } from './services/cloudSyncService';
import Header from './components/Header';
import DailyCheckinForm from './components/DailyCheckinForm';
import CoachingResponse from './components/CoachingResponse';
import SmartSync from './components/SmartSync';
import VoiceSync from './components/VoiceSync';
import ProgressDashboard from './components/ProgressDashboard';
import CalendarPicker from './components/CalendarPicker';
import LanguageSwitcher from './components/LanguageSwitcher';

const initialFormData: DailyCheckinData = {
    metrics: { weight: '', bodyFat: '' },
    diet: { hydration: '', supplements: '', breakfast: '', lunch: '', snacks: '', dinner: '' },
    training: { trained: false, type: '', rpe: 5, exercises: [] },
    recovery: { 
      general: 5, 
      muscleSoreness: 5, 
      jointPain: 5, 
      sleepQuality: 5,
      mood: 5,
      concentration: 5,
      appetite: 5,
      emotion: ''
    },
    planning: { activity: '', duration: '', focus: '' },
    remarks: '',
};

const STORAGE_KEY_FORM = 'ai_fitness_coach_form_v2';
const STORAGE_KEY_HISTORY = 'ai_fitness_coach_history_v2';
const STORAGE_KEY_NAME = 'ai_fitness_coach_name_v2';
const STORAGE_KEY_BIO = 'ai_fitness_coach_bio_v2';
const STORAGE_KEY_SYNC_URL = 'ai_fitness_coach_sync_url';

type ViewMode = 'checkin' | 'history' | 'dashboard';

function App() {
    const [language, setLanguage] = useState<Language>('de');
    const [userName, setUserName] = useState('');
    const [userBio, setUserBio] = useState('');
    const [cloudSyncUrl, setCloudSyncUrl] = useState('');
    const [formData, setFormData] = useState<DailyCheckinData>(initialFormData);
    const [history, setHistory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [response, setResponse] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('checkin');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    
    const [selectedHistoryDate, setSelectedHistoryDate] = useState<Date>(new Date());
    const [callDate, setCallDate] = useState<Date | null>(null);
    const [autoStartCall, setAutoStartCall] = useState<number>(0);
    const [showBackupModal, setShowBackupModal] = useState(false);
    
    const [macros, setMacros] = useState<MacroAnalysis | null>(null);
    const [isEstimatingMacros, setIsEstimatingMacros] = useState(false);
    const macroTimerRef = useRef<number | null>(null);

    // Robust Initial Load
    useEffect(() => {
        const load = () => {
          const savedUrl = localStorage.getItem(STORAGE_KEY_SYNC_URL);
          if (savedUrl) setCloudSyncUrl(savedUrl);

          const savedName = localStorage.getItem(STORAGE_KEY_NAME);
          if (savedName) setUserName(savedName);
          
          const savedBio = localStorage.getItem(STORAGE_KEY_BIO);
          if (savedBio) setUserBio(savedBio);

          const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
          if (savedHistory) {
              try { setHistory(JSON.parse(savedHistory)); } catch(e) { console.error("History parse error", e); }
          }

          const savedForm = localStorage.getItem(STORAGE_KEY_FORM);
          if (savedForm) {
              try { 
                const parsed = JSON.parse(savedForm);
                setFormData(prev => ({ ...prev, ...parsed })); 
              } catch(e) { console.error("Form parse error", e); }
          }
        };
        load();
    }, []);

    // Persistence
    useEffect(() => { localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(formData)); }, [formData]);
    useEffect(() => { localStorage.setItem(STORAGE_KEY_NAME, userName); }, [userName]);
    useEffect(() => { localStorage.setItem(STORAGE_KEY_BIO, userBio); }, [userBio]);
    useEffect(() => { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history)); }, [history]);
    useEffect(() => { localStorage.setItem(STORAGE_KEY_SYNC_URL, cloudSyncUrl); }, [cloudSyncUrl]);

    const t = useCallback((key: string) => {
        return translations[key]?.[language] || key;
    }, [language]);

    const handleFormChange = (section: keyof DailyCheckinData, field: any, value: any) => {
        if (section === 'remarks') {
            setFormData(prev => ({...prev, remarks: value}));
        } else {
            setFormData(prev => ({
                ...prev,
                [section]: { ...prev[section], [field]: value }
            }));
        }
    };

    const handleDataSync = (syncedData: DailyCheckinData) => {
        setFormData(prev => ({
            ...syncedData,
            metrics: syncedData.metrics || prev.metrics,
            training: {
                ...syncedData.training,
                exercises: syncedData.training?.exercises || []
            }
        }));
    };

    // Fix: Added missing startRetroactiveCall function to handle backfilling history entries via voice call.
    const startRetroactiveCall = (date: Date) => {
        setCallDate(date);
        setViewMode('checkin');
        setAutoStartCall(Date.now());
    };
    
    const handleSubmit = async (e: React.FormEvent, explicitDate?: string) => {
        e && e.preventDefault();
        setIsLoading(true);
        setError(null);
        setResponse('');
        try {
            const advice = await getCoachingAdvice(formData, language, history, userBio);
            setResponse(advice);
            
            const entryDate = explicitDate || new Date().toLocaleDateString();
            const newHistoryEntry = {
                date: entryDate,
                timestamp: explicitDate ? new Date(explicitDate).getTime() : Date.now(),
                ...formData,
                macros
            };
            
            const updatedHistory = [...history];
            const existingIdx = updatedHistory.findIndex(h => h.date === newHistoryEntry.date);
            if (existingIdx >= 0) {
              updatedHistory[existingIdx] = newHistoryEntry;
            } else {
              updatedHistory.push(newHistoryEntry);
            }
            
            setHistory(updatedHistory);
            
            // Cloud Push
            if (cloudSyncUrl) {
              setIsSyncing(true);
              await syncToCloud(cloudSyncUrl, 'saveEntry', { entry: newHistoryEntry });
              setIsSyncing(false);
            }

            setCallDate(null);
        } catch (err) {
            setError('Failed to validate progress.');
        } finally {
            setIsLoading(false);
        }
    };

    const pullFromCloud = async () => {
      if (!cloudSyncUrl) return;
      setIsSyncing(true);
      try {
        // Since Apps Script with 'no-cors' is limited for GET, 
        // a better way is to send a POST action: 'fetchAll'
        const result = await fetch(cloudSyncUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'fetchAll' })
        });
        const data = await result.json();
        if (data.history) {
          setHistory(data.history);
          alert(language === 'de' ? "Cloud-Daten geladen!" : "Cloud data pulled!");
        }
      } catch (e) {
        alert("Cloud Fetch failed. Please check your URL & Script deployment (Web App / Anyone).");
      } finally {
        setIsSyncing(false);
      }
    };

    const selectedEntry = history.find(h => h.date === selectedHistoryDate.toLocaleDateString());

    return (
    <div className="min-h-screen bg-cyber-black text-slate-200 selection:bg-cyber-green selection:text-cyber-black transition-colors duration-500">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden h-screen z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyber-purple/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[50%] bg-cyber-green/5 rounded-full blur-[100px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-cyber-orange/5 rounded-full blur-[80px]"></div>
      </div>

      <Header 
        language={language}
        setLanguage={setLanguage}
        userName={userName} 
        userBio={userBio} 
        setUserName={setUserName} 
        setUserBio={setUserBio} 
        cloudSyncUrl={cloudSyncUrl}
        setCloudSyncUrl={setCloudSyncUrl}
        isSyncing={isSyncing}
        t={t} 
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Main Workspace */}
          <div className="flex-1 space-y-12">
            {/* Terminal Tabs */}
            <div className="flex items-center space-x-2 bg-cyber-gray p-1.5 rounded-2xl border border-white/5 shadow-2xl overflow-x-auto no-scrollbar">
              {[
                { id: 'checkin', label: t('dailyCheckin'), icon: PlusCircle, color: 'text-cyber-green' },
                { id: 'history', label: t('calendar'), icon: History, color: 'text-cyber-orange' },
                { id: 'dashboard', label: 'DATA HUB', icon: BarChart3, color: 'text-cyber-purple' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setViewMode(tab.id as ViewMode); if(tab.id !== 'checkin') setCallDate(null); }}
                  className={`flex items-center space-x-3 px-6 py-3 rounded-xl font-display font-black text-xs uppercase tracking-widest transition-all ${
                    viewMode === tab.id 
                      ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/20' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <tab.icon size={16} className={viewMode === tab.id ? tab.color : ''} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={viewMode}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {viewMode === 'checkin' && (
                  <DailyCheckinForm 
                    formData={formData} 
                    handleFormChange={handleFormChange} 
                    handleSubmit={(e) => handleSubmit(e, callDate?.toLocaleDateString())}
                    isLoading={isLoading}
                    language={language}
                    t={t}
                    macros={macros}
                    isEstimatingMacros={isEstimatingMacros}
                  />
                )}
                {viewMode === 'dashboard' && (
                  <ProgressDashboard history={history} t={t} />
                )}
                {viewMode === 'history' && (
                  <div className="space-y-8">
                    <CalendarPicker history={history} selectedDate={selectedHistoryDate} onDateChange={setSelectedHistoryDate} t={t} />
                    
                    {selectedEntry ? (
                        <div className="bg-cyber-gray p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-4 opacity-5">
                               <History size={100} />
                           </div>
                           <div className="flex justify-between items-start mb-8 relative z-10">
                               <span className="block font-display font-black italic text-3xl text-white uppercase tracking-tighter">{selectedEntry.date}</span>
                               <div className="bg-cyber-purple/10 px-4 py-1.5 rounded-full border border-cyber-purple/20 text-[10px] font-black text-cyber-purple uppercase tracking-widest">Archive Log</div>
                           </div>
                           <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8 relative z-10">
                               <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                   <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Body Weight</div>
                                   <div className="text-2xl font-display font-black italic text-white">{selectedEntry.metrics.weight} <span className="text-xs font-bold text-cyber-purple">KG</span></div>
                               </div>
                               <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                   <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Body Fat</div>
                                   <div className="text-2xl font-display font-black italic text-white">{selectedEntry.metrics.bodyFat} <span className="text-xs font-bold text-cyber-orange">%</span></div>
                               </div>
                           </div>
                           <div className="space-y-4 relative z-10">
                             <div className="flex items-center space-x-2 mb-4">
                                <Zap size={14} className="text-cyber-green" />
                                <h4 className="text-[10px] font-black uppercase text-cyber-green tracking-[0.4em] font-display">Mission Exercises</h4>
                             </div>
                             {selectedEntry.training.exercises.map((ex: any, i: number) => (
                               <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                                 <span className="text-sm font-black uppercase italic text-white">{ex.name}</span>
                                 <span className="text-xs font-bold text-slate-500">{ex.sets}x{ex.reps} @ {ex.weight}{ex.weightType}</span>
                               </div>
                             ))}
                             {selectedEntry.training.exercises.length === 0 && (
                                <p className="text-slate-600 text-xs italic font-bold uppercase tracking-widest">No active training logged.</p>
                             )}
                           </div>
                        </div>
                    ) : (
                        <div className="p-16 text-center bg-cyber-gray rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                           <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent"></div>
                           <div className="relative z-10">
                               <p className="text-slate-500 font-display font-black italic uppercase tracking-[0.2em] mb-8">{t('noLogForDate')}</p>
                               <button 
                                 onClick={() => startRetroactiveCall(selectedHistoryDate)} 
                                 className="inline-flex items-center space-x-3 px-10 py-5 bg-cyber-orange text-cyber-black font-display font-black italic uppercase text-sm rounded-2xl hover:scale-105 transition-transform active:scale-95 shadow-[0_0_30px_rgba(255,107,0,0.2)]"
                               >
                                 <Activity size={18} />
                                 <span>{t('backfillCall')}</span>
                               </button>
                           </div>
                        </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Side Panel: Intelligence & Systems */}
          <aside className="lg:w-[400px] shrink-0 space-y-8">
            <div className="sticky top-8 space-y-8">
              <section>
                <div className="flex items-center space-x-2 mb-4">
                    <Cpu size={14} className="text-cyber-purple" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyber-purple/60 font-display">Intelligence HUD</span>
                </div>
                <CoachingResponse response={response} isLoading={isLoading} error={error} t={t} />
              </section>

              <div className="bg-cyber-gray rounded-3xl border border-white/5 p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyber-purple/5 blur-3xl group-hover:bg-cyber-purple/10 transition-colors"></div>
                
                <div className="flex items-center space-x-3 mb-8 text-white">
                  <Settings size={18} className="text-cyber-purple" />
                  <h3 className="font-display font-bold uppercase tracking-tighter text-lg leading-none">System Configuration</h3>
                </div>

                <div className="space-y-6">
                    <div className="p-1 bg-white/[0.03] rounded-2xl border border-white/5">
                        <LanguageSwitcher language={language} setLanguage={setLanguage} />
                    </div>
                    
                    <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-5">
                            <Globe size={40} />
                        </div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                                <Globe size={14} className="text-cyber-green" />
                                <span className="text-[10px] font-black uppercase text-slate-400 font-display">Cloud Uplink</span>
                            </div>
                            <button 
                                onClick={() => setShowBackupModal(true)}
                                className="text-[9px] font-black uppercase text-cyber-purple hover:text-white transition-colors underline underline-offset-4"
                            >
                                Configure
                            </button>
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${cloudSyncUrl ? 'bg-cyber-green shadow-[0_0_8px_#ADFF2F]' : 'bg-slate-700'} animate-pulse`}></div>
                            <span className="text-xs font-bold text-white uppercase truncate max-w-[150px] font-display tracking-tight">
                                {cloudSyncUrl ? cloudSyncUrl : 'OFFLINE_MODE'}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <VoiceSync 
                          onDataParsed={handleDataSync} 
                          t={t} 
                          language={language} 
                          userName={userName} 
                          userBio={userBio}
                          targetDate={callDate}
                          autoStartTrigger={autoStartCall}
                        />
                        <SmartSync t={t} onDataParsed={handleDataSync} />
                    </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-2">
                <div className="flex items-center space-x-4">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase text-slate-600 tracking-widest font-display">Build</span>
                        <span className="text-[10px] font-black text-slate-400">2.5.0-A</span>
                    </div>
                    <div className="w-px h-6 bg-slate-800"></div>
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase text-slate-600 tracking-widest font-display">Protocol</span>
                        <span className="text-[10px] font-black text-slate-400 italic">SECURE_CHANNEL_V2</span>
                    </div>
                </div>
                <Zap size={16} className="text-cyber-purple/20" />
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Cloud Link Setup Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-cyber-black/90 backdrop-blur-md"
            onClick={() => setShowBackupModal(false)}
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-cyber-gray w-full max-w-md rounded-[2.5rem] border border-cyber-purple/30 p-10 shadow-[0_0_60px_rgba(139,92,246,0.15)] relative z-10"
          >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                    <CloudLightning className="text-cyber-purple" />
                    <h3 className="text-2xl font-display font-black uppercase tracking-tighter text-white">Cloud Link Setup</h3>
                </div>
                <button onClick={() => setShowBackupModal(false)} className="text-slate-600 hover:text-white transition-colors">
                    <svg size={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-cyber-purple tracking-[0.2em] font-display ml-1">Apps Script URL</label>
                <input
                    type="text"
                    placeholder="https://script.google.com/macros/s/..."
                    value={cloudSyncUrl}
                    onChange={(e) => setCloudSyncUrl(e.target.value)}
                    className="w-full bg-cyber-black border-2 border-white/5 rounded-2xl px-5 py-5 text-white text-sm font-bold focus:border-cyber-purple outline-none transition-all placeholder:text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => { syncToCloud(cloudSyncUrl, 'syncAll', { history }); setShowBackupModal(false); }} className="py-5 bg-cyber-purple text-white text-[10px] font-black uppercase italic rounded-2xl hover:opacity-80 transition-all shadow-[0_4px_20px_rgba(139,92,246,0.3)]">Push Data</button>
                <button onClick={() => { pullFromCloud(); setShowBackupModal(false); }} className="py-5 bg-cyber-green text-cyber-black text-[10px] font-black uppercase italic rounded-2xl hover:opacity-80 transition-all shadow-[0_4px_20px_rgba(173,255,47,0.3)]">Pull Data</button>
              </div>

              <div className="p-6 bg-cyber-black rounded-[2rem] border border-white/5">
                <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase space-y-2">
                   <span className="block text-cyber-purple/60">01 // Create Google Sheet</span>
                   <span className="block text-cyber-purple/60">02 // Extensions &gt; Apps Script</span>
                   <span className="block text-cyber-purple/60">03 // Paste deployment code</span>
                   <span className="block text-cyber-purple/60">04 // Deploy as Web App (Anyone)</span>
                </p>
              </div>

              <button 
                onClick={() => setShowBackupModal(false)}
                className="w-full py-2 text-slate-700 font-black uppercase text-[10px] hover:text-slate-400 transition-colors tracking-widest font-display"
              >
                Close Systems
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default App;

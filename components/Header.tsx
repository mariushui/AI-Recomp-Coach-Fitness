
import React, { useState } from 'react';
import { Shield, User, Info, Cpu } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import type { Language } from '../types';

interface HeaderProps {
    language: Language;
    setLanguage: (lang: Language) => void;
    userName: string;
    setUserName: (name: string) => void;
    userBio: string;
    setUserBio: (bio: string) => void;
    cloudSyncUrl: string;
    setCloudSyncUrl: (url: string) => void;
    isSyncing: boolean;
    t: (key: string) => string;
}

const Header: React.FC<HeaderProps> = ({ 
  language, 
  setLanguage, 
  userName, 
  setUserName, 
  userBio, 
  setUserBio, 
  cloudSyncUrl, 
  setCloudSyncUrl,
  isSyncing, 
  t 
}) => {
  const [isBioOpen, setIsBioOpen] = useState(false);

  return (
    <header className="relative z-20 border-b border-white/5 bg-cyber-black/50 backdrop-blur-xl sticky top-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-24">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyber-purple to-cyber-darkpurple flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)] border border-white/10">
               <Shield className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-black italic tracking-tighter text-white leading-none mb-1">AI RECOMP COACH</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-cyber-orange' : 'bg-cyber-green'} animate-pulse shadow-[0_0_8px_currentColor]`}></div>
                <span className={`text-[10px] font-black uppercase ${isSyncing ? 'text-cyber-orange' : 'text-cyber-green'} tracking-widest font-display`}>
                  {isSyncing ? 'Uplink Synchronizing' : 'Neural Link Active'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-8">
            <div className="hidden md:flex flex-col items-end">
              <div className="flex items-center space-x-3 mb-1">
                <User size={12} className="text-cyber-purple opacity-60" />
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="bg-transparent text-xs font-black uppercase text-white hover:bg-white/5 px-2 py-1 rounded transition-colors focus:bg-white/10 outline-none font-display min-w-[120px] text-right placeholder-slate-700"
                  placeholder="SUBJECT_IDENT"
                />
              </div>
              <button 
                onClick={() => setIsBioOpen(true)}
                className="flex items-center space-x-3 group"
              >
                <Info size={10} className="text-slate-500 group-hover:text-cyber-purple transition-colors" />
                <span className="text-[9px] font-bold uppercase text-slate-500 group-hover:text-slate-300 transition-colors font-display text-right max-w-[200px] truncate">
                    {userBio || 'NO_BIO_RECORDED'}
                </span>
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
                <div className="hidden sm:block h-8 w-px bg-white/5 mx-2"></div>
                <LanguageSwitcher language={language} setLanguage={setLanguage} />
            </div>
          </div>
        </div>
      </div>

      {isBioOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-cyber-black/90 backdrop-blur-xl" onClick={() => setIsBioOpen(false)}></div>
          <div className="bg-cyber-gray w-full max-w-xl rounded-[2.5rem] border border-cyber-purple/30 shadow-[0_0_50px_rgba(139,92,246,0.1)] overflow-hidden relative z-10">
            <div className="p-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-display font-black uppercase tracking-tighter text-white">Coach Intelligence Core</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyber-purple/60">Neural Pattern Knowledge base</p>
              </div>
              <button onClick={() => setIsBioOpen(false)} className="text-slate-600 hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-10 space-y-8">
              <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                      <Cpu size={14} className="text-cyber-purple" />
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Permanent Intel</span>
                  </div>
                  <textarea 
                    value={userBio}
                    onChange={(e) => setUserBio(e.target.value)}
                    placeholder="Examples: 'Lower back injury history...', 'Targeting 2500kcal maintenance.'"
                    className="w-full h-48 bg-cyber-black border-2 border-white/5 rounded-2xl p-6 text-white font-bold text-sm outline-none resize-none transition-all placeholder-slate-800 focus:border-cyber-purple/50 custom-scrollbar"
                  />
              </div>
              <button 
                onClick={() => setIsBioOpen(false)}
                className="w-full py-5 bg-cyber-green text-cyber-black font-display font-black italic uppercase rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_30px_rgba(173,255,47,0.2)]"
              >
                Sync Neural Core
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;

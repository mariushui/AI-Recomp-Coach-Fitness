
import React from 'react';
import type { Language } from '../types';

interface LanguageSwitcherProps {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ language, setLanguage }) => {
  return (
    <div className="flex items-center space-x-1 rounded-full bg-slate-200 dark:bg-slate-700 p-1">
      <button 
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${language === 'en' ? 'bg-white text-slate-800 dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
      >
        EN
      </button>
      <button 
        onClick={() => setLanguage('de')}
        className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${language === 'de' ? 'bg-white text-slate-800 dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
      >
        DE
      </button>
    </div>
  );
};

export default LanguageSwitcher;

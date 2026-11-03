
import React from 'react';

interface CoachingResponseProps {
  response: string;
  isLoading: boolean;
  error: string | null;
  t: (key: string) => string;
}

const CoachingResponse: React.FC<CoachingResponseProps> = ({ response, isLoading, error, t }) => {
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-12">
          <div className="relative mb-6">
            <div className="absolute inset-0 animate-ping bg-cyber-green rounded-full opacity-20"></div>
            <svg className="animate-spin h-14 w-14 text-cyber-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-cyber-green font-black uppercase italic tracking-widest animate-pulse">{t('loadingMessage')}</p>
        </div>
      );
    }
    if (error) {
      return <div className="p-8 text-cyber-orange font-bold uppercase text-center border-2 border-cyber-orange/20 rounded-2xl mx-6 mb-6">{t('errorMessage')}</div>;
    }
    if (!response) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-12">
            <div className="bg-cyber-purple/10 p-6 rounded-full mb-6 border border-cyber-purple/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyber-purple"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
            </div>
          <p className="text-cyber-purple/60 font-black uppercase tracking-widest text-sm">{t('introMessage')}</p>
        </div>
      );
    }

    const formattedResponse = response
      .replace(/### (.*)/g, '<h3 class="text-xl font-black italic uppercase mt-8 mb-4 text-cyber-purple tracking-tighter">$1</h3>')
      .replace(/## (.*)/g, '<h2 class="text-2xl font-black italic uppercase mt-10 mb-5 border-b-2 border-cyber-purple pb-2 tracking-tighter">$1</h2>')
      .replace(/\* \s*(.*)/g, '<li class="ml-5 list-none relative pl-6 mb-3 font-bold text-slate-300 before:content-[\'→\'] before:absolute before:left-0 before:text-cyber-green">$1</li>')
      .replace(/\[VALIDATED\]/g, '<span class="inline-block bg-cyber-green text-cyber-black px-4 py-1.5 rounded-lg text-sm font-black italic uppercase mb-4 shadow-[0_0_15px_rgba(173,255,47,0.4)]">VALIDATED PROGRESS</span>')
      .replace(/\[VALIDIERT\]/g, '<span class="inline-block bg-cyber-green text-cyber-black px-4 py-1.5 rounded-lg text-sm font-black italic uppercase mb-4 shadow-[0_0_15px_rgba(173,255,47,0.4)]">VALIDIERTER FORTSCHRITT</span>')
      .replace(/\n/g, '<br />');

    return (
      <div className="relative group">
        <div className="prose prose-invert max-w-none p-8 font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedResponse }} />
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyber-purple/5 rounded-full blur-3xl group-hover:bg-cyber-purple/10 transition-all"></div>
      </div>
    );
  };

  return (
    <div className="bg-cyber-gray rounded-3xl border-t-8 border-cyber-purple sport-shadow overflow-hidden cyber-border">
      <div className="flex items-center justify-between p-8 border-b border-cyber-purple/10 bg-cyber-purple/5">
        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">AI ANALYSIS ENGINE</h3>
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-cyber-green shadow-[0_0_10px_#ADFF2F]"></div>
          <div className="w-3 h-3 rounded-full bg-cyber-purple shadow-[0_0_10px_#8B5CF6]"></div>
        </div>
      </div>
      <div className="min-h-[300px] max-h-[85vh] overflow-y-auto custom-scrollbar">
        {renderContent()}
      </div>
    </div>
  );
};

export default CoachingResponse;

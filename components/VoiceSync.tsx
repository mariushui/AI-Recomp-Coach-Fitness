
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { updateCheckinDataTool } from '../services/geminiService';
import type { DailyCheckinData, Language } from '../types';

interface VoiceSyncProps {
  onDataParsed: (data: DailyCheckinData) => void;
  t: (key: string) => string;
  language: Language;
  userName: string;
  userBio: string;
  targetDate?: Date | null;
  autoStartTrigger?: number; // Timestamp to trigger auto-start
}

const VoiceSync: React.FC<VoiceSyncProps> = ({ onDataParsed, t, language, userName, userBio, targetDate, autoStartTrigger }) => {
  const [isActive, setIsActive] = useState(false);
  const [isCoachSpeaking, setIsCoachSpeaking] = useState(false);
  
  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const stopCall = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    setIsActive(false);
    setIsCoachSpeaking(false);
  };

  const startCall = async () => {
    if (isActive) return;
    setIsActive(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const dateStr = targetDate ? targetDate.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
    const isToday = !targetDate || targetDate.toDateString() === new Date().toDateString();

    // Streamlined instructions to reduce initial processing time
    const systemInstruction = language === 'de' 
      ? `Du bist 'RECOMP COACH'. Führe einen extrem schnellen Check-in.
         Hintergrund: ${userBio || 'Standard'}.
         Ziel: Logge den ${isToday ? 'heutigen Tag' : dateStr}.
         1. Begrüße kurz: 'Hey ${userName || 'Champ'}, wie war dein Tag?'
         2. Erfrage: Ernährung, Training, Schlaf.
         3. Nutze 'updateCheckinData' sofort bei neuen Infos.
         4. Antworte in max. 1-2 kurzen Sätzen.`
      : `You are 'RECOMP COACH'. Lead a high-speed check-in.
         Bio: ${userBio || 'Standard'}.
         Target: Log ${isToday ? 'today' : dateStr}.
         1. Brief intro: 'Hey ${userName || 'Champ'}, how was your session?'
         2. Ask: Diet, Training, Sleep.
         3. Call 'updateCheckinData' immediately as data arrives.
         4. Keep responses to 1-2 short sentences.`;

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const l = inputData.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
            const pcmBlob = {
              data: encode(new Uint8Array(int16.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContextRef.current!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'updateCheckinData') {
                onDataParsed(fc.args as DailyCheckinData);
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } }
                }));
              }
            }
          }

          const audioBase64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioBase64) {
            setIsCoachSpeaking(true);
            const ctx = outputAudioContextRef.current!;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            const audioBuffer = await decodeAudioData(decode(audioBase64), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) setIsCoachSpeaking(false);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }

          if (message.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => s.stop());
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            setIsCoachSpeaking(false);
          }
        },
        onclose: () => stopCall(),
        onerror: (e) => { console.error(e); stopCall(); }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction,
        // Set thinkingBudget to 0 for minimum latency
        thinkingConfig: { thinkingBudget: 0 },
        tools: [{ functionDeclarations: [updateCheckinDataTool] }]
      }
    });

    sessionRef.current = await sessionPromise;
  };

  useEffect(() => {
    if (autoStartTrigger && !isActive) {
      startCall();
    }
  }, [autoStartTrigger]);

  useEffect(() => {
    return () => stopCall();
  }, []);

  return (
    <div id="voice-coach-container" className={`
      relative overflow-hidden mb-16 p-10 rounded-[2.5rem] transition-all duration-700
      ${isActive ? 'bg-cyber-black ring-8 ring-cyber-green/30' : 'bg-cyber-green shadow-[0_20px_60px_rgba(173,255,47,0.3)]'}
    `}>
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-cyber-purple/20 rounded-full blur-2xl"></div>

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="text-center md:text-left">
          <h3 className={`text-4xl font-[1000] italic uppercase tracking-tighter leading-none mb-2 ${isActive ? 'text-cyber-green' : 'text-cyber-black'}`}>
            {t('voiceTitle')}
          </h3>
          <p className={`text-xs font-black uppercase tracking-[0.3em] ${isActive ? 'text-cyber-purple' : 'text-cyber-black/60'}`}>
            {isActive ? t('coachListening') : t('voiceSubtitle')}
          </p>
          {targetDate && targetDate.toDateString() !== new Date().toDateString() && !isActive && (
            <div className="mt-4 inline-block px-4 py-1.5 bg-cyber-black text-cyber-green text-[10px] font-black uppercase italic rounded-full shadow-lg">
              SYNCING DATE: {targetDate.toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            {isActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none -translate-y-16">
                <div className="flex items-center space-x-1.5 h-12">
                  {[...Array(6)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1.5 rounded-full animate-wave ${isCoachSpeaking ? 'bg-cyber-purple' : 'bg-cyber-green'}`} 
                      style={{ height: `${30 + Math.random() * 70}%`, animationDelay: `${i * 0.15}s` }}
                    ></div>
                  ))}
                </div>
              </div>
            )}
            
            <button
              onClick={isActive ? stopCall : startCall}
              className={`
                group relative w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-500 shadow-2xl overflow-hidden
                ${isActive ? 'bg-cyber-orange scale-110' : 'bg-cyber-black hover:scale-105 active:scale-95'}
              `}
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              {isActive ? (
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              ) : (
                <svg className="w-10 h-10 text-cyber-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"></path>
                </svg>
              )}
            </button>
          </div>
          
          <span className={`mt-4 text-[10px] font-black italic uppercase tracking-widest ${isActive ? 'text-cyber-green animate-pulse' : 'text-cyber-black'}`}>
            {isActive ? (isCoachSpeaking ? 'COACH TALKING' : 'LISTENING') : 'INITIALIZE SESSION'}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
          50% { transform: scaleY(1.4); opacity: 1; }
        }
        .animate-wave {
          animation: wave 0.8s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
    </div>
  );
};

export default VoiceSync;

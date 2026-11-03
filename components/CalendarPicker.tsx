
import React, { useState } from 'react';

interface CalendarPickerProps {
  history: any[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  t: (key: string) => string;
}

const CalendarPicker: React.FC<CalendarPickerProps> = ({ history, selectedDate, onDateChange, t }) => {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const startOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1; // Adjust for Monday start
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear();
  };

  const isSelected = (day: number) => {
    return selectedDate.getDate() === day && selectedDate.getMonth() === viewDate.getMonth() && selectedDate.getFullYear() === viewDate.getFullYear();
  };

  const hasData = (day: number) => {
    const dStr = new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toLocaleDateString();
    return history.some(h => h.date === dStr);
  };

  const changeMonth = (offset: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  const monthNames = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  const days = [];
  const startIdx = startOfMonth(viewDate);
  for (let i = 0; i < startIdx; i++) days.push(null);
  for (let i = 1; i <= daysInMonth(viewDate); i++) days.push(i);

  return (
    <div className="bg-cyber-gray p-8 rounded-3xl border border-cyber-purple/20 sport-shadow">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-black italic text-white text-xl uppercase tracking-tighter">
          {monthNames[viewDate.getMonth()]} <span className="text-cyber-purple">{viewDate.getFullYear()}</span>
        </h3>
        <div className="flex space-x-2">
          <button onClick={() => changeMonth(-1)} className="p-2 bg-cyber-black border border-cyber-purple/20 hover:border-cyber-green rounded-xl transition-all text-cyber-purple hover:text-cyber-green">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <button onClick={() => changeMonth(1)} className="p-2 bg-cyber-black border border-cyber-purple/20 hover:border-cyber-green rounded-xl transition-all text-cyber-purple hover:text-cyber-green">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center mb-4">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] font-black text-cyber-purple/50 uppercase tracking-widest">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          if (day === null) return <div key={i} className="h-12"></div>;
          
          const dataExists = hasData(day);
          const selected = isSelected(day);
          const current = isToday(day);
          
          return (
            <button
              key={i}
              onClick={() => onDateChange(new Date(viewDate.getFullYear(), viewDate.getMonth(), day))}
              className={`
                h-12 rounded-xl text-sm font-black transition-all relative flex items-center justify-center border
                ${selected ? 'bg-cyber-purple text-white border-cyber-purple shadow-[0_0_20px_rgba(139,92,246,0.5)] scale-110 z-10' : 
                  current ? 'bg-cyber-black border-cyber-green text-cyber-green' :
                  'bg-cyber-black border-cyber-purple/10 text-slate-400 hover:border-cyber-purple hover:text-white'}
              `}
            >
              {day}
              {dataExists && (
                <span className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${selected ? 'bg-white text-white' : 'bg-cyber-green text-cyber-green'}`}></span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarPicker;


import React, { useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area 
} from 'recharts';
import { Weight, Zap, Heart, Flame, Brain, Moon, Smile } from 'lucide-react';
import type { DailyCheckinData, Language } from '../types';

interface ProgressDashboardProps {
  history: any[];
  t: (key: string) => string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-cyber-gray border border-cyber-purple/30 p-4 rounded-xl shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-black text-cyber-purple uppercase tracking-widest mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((p: any, i: number) => (
            <p key={i} className="text-sm font-black italic text-white leading-none flex items-center justify-between gap-4">
              <span className="text-[10px] uppercase text-slate-500 font-sans">{p.name}:</span>
              <span>{p.value} <span className="text-[8px] font-bold text-cyber-purple/60 uppercase">{p.unit || ''}</span></span>
            </p>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ history, t }) => {
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => a.timestamp - b.timestamp);
  }, [history]);

  const stats = useMemo(() => {
    if (sortedHistory.length === 0) return null;

    const latest = sortedHistory[sortedHistory.length - 1];
    const first = sortedHistory[0];
    
    const weightDiff = parseFloat(latest.metrics.weight) - parseFloat(first.metrics.weight);
    const bfDiff = parseFloat(latest.metrics.bodyFat) - parseFloat(first.metrics.bodyFat);
    
    const avgMacros = sortedHistory.reduce((acc, curr) => {
      if (curr.macros) {
        acc.p += curr.macros.protein;
        acc.c += curr.macros.carbs;
        acc.f += curr.macros.fat;
        acc.kcal += curr.macros.calories;
        acc.count += 1;
      }
      return acc;
    }, { p: 0, c: 0, f: 0, kcal: 0, count: 0 });

    const avgRecovery = sortedHistory.reduce((acc, curr) => {
      acc.sleep += curr.recovery.sleepQuality;
      acc.mood += curr.recovery.mood;
      acc.count += 1;
      return acc;
    }, { sleep: 0, mood: 0, count: 0 });

    return {
      weightDiff: weightDiff.toFixed(1),
      bfDiff: bfDiff.toFixed(1),
      avgP: avgMacros.count ? Math.round(avgMacros.p / avgMacros.count) : 0,
      avgKcal: avgMacros.count ? Math.round(avgMacros.kcal / avgMacros.count) : 0,
      avgSleep: avgRecovery.count ? (avgRecovery.sleep / avgRecovery.count).toFixed(1) : 0,
      totalWorkouts: sortedHistory.filter(h => h.training.trained).length,
    };
  }, [sortedHistory]);

  const chartData = useMemo(() => {
    return sortedHistory.map(h => ({
      date: h.date,
      weight: parseFloat(h.metrics.weight),
      bodyFat: parseFloat(h.metrics.bodyFat),
      kcal: h.macros?.calories || 0,
      sleep: h.recovery.sleepQuality,
      mood: h.recovery.mood,
      focus: h.recovery.concentration
    }));
  }, [sortedHistory]);

  if (sortedHistory.length === 0) {
    return (
      <div className="bg-cyber-gray p-12 rounded-3xl border border-cyber-purple/20 text-center shadow-2xl">
        <div className="bg-cyber-purple/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-cyber-purple/30">
          <Weight className="w-10 h-10 text-cyber-purple" />
        </div>
        <h3 className="text-white font-display font-black text-2xl mb-2 uppercase tracking-tighter">Database Offline</h3>
        <p className="text-cyber-purple/60 text-sm font-bold uppercase tracking-widest">Execute check-in to initialize tracking.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Weight Delta', val: `${stats!.weightDiff}`, unit: 'kg', color: 'border-cyber-purple', bg: 'bg-cyber-purple/5', icon: Weight },
          { label: 'BF Delta', val: `${stats!.bfDiff}`, unit: '%', color: 'border-cyber-orange', bg: 'bg-cyber-orange/5', icon: Zap },
          { label: 'Avg Protein', val: `${stats!.avgP}`, unit: 'g', color: 'border-cyber-green', bg: 'bg-cyber-green/5', icon: Flame },
          { label: 'Workouts', val: stats!.totalWorkouts, unit: 'SES', color: 'border-white', bg: 'bg-white/5', icon: Heart }
        ].map((item, idx) => (
          <div key={idx} className={`bg-cyber-gray p-6 rounded-2xl border border-white/5 border-b-4 ${item.color} ${item.bg} transition-transform hover:-translate-y-1`}>
            <div className="flex justify-between items-start mb-3">
              <div className="text-[10px] text-cyber-purple font-black uppercase tracking-[0.2em]">{item.label}</div>
              <item.icon size={14} className="text-cyber-purple/40" />
            </div>
            <div className={`text-3xl font-display font-black italic tracking-tighter text-white`}>
              {item.val} <span className="text-xs font-bold text-cyber-purple/40 uppercase font-sans tracking-normal">{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-cyber-gray p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Weight size={120} />
          </div>
          <h4 className="text-[10px] font-black text-cyber-purple uppercase mb-8 tracking-[0.3em] font-display">Weight Trajectory // Database</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#8B5CF666', fontSize: 9, fontWeight: 900}} 
                  dy={10}
                />
                <YAxis 
                  hide={true} 
                  domain={['dataMin - 1', 'dataMax + 1']} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="weight" 
                  stroke="#8B5CF6" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorWeight)" 
                  unit="kg"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-cyber-gray p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Zap size={120} />
          </div>
          <h4 className="text-[10px] font-black text-cyber-orange uppercase mb-8 tracking-[0.3em] font-display">Fat Oxidation Trend // Analysis</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorBF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#FF6B0066', fontSize: 9, fontWeight: 900}} 
                  dy={10}
                />
                <YAxis 
                  hide={true} 
                  domain={['dataMin - 1', 'dataMax + 1']} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="bodyFat" 
                  stroke="#FF6B00" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorBF)" 
                  unit="%"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-cyber-gray p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Flame size={120} />
        </div>
        <div className="flex justify-between items-center mb-8">
            <h4 className="text-[10px] font-black text-cyber-green uppercase tracking-[0.3em] font-display">Caloric Input Stability // Monitoring</h4>
            <div className="text-[10px] font-black text-white px-3 py-1 bg-cyber-green/10 border border-cyber-green/20 rounded-full tracking-tighter">AVG: {stats!.avgKcal} KCAL</div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.filter(d => d.kcal > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#ADFF2F66', fontSize: 9, fontWeight: 900}} 
                dy={10}
              />
              <YAxis hide={true} />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                name="Calories"
                type="stepAfter" 
                dataKey="kcal" 
                stroke="#ADFF2F" 
                strokeWidth={3}
                dot={{ r: 4, fill: '#ADFF2F', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#white', strokeWidth: 0 }}
                unit="Kcal"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-cyber-gray p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Brain size={120} />
        </div>
        <div className="flex justify-between items-center mb-8">
            <h4 className="text-[10px] font-black text-cyber-purple uppercase tracking-[0.3em] font-display">Neural Core Stability // Psych Correlation</h4>
            <div className="text-[10px] font-black text-white px-3 py-1 bg-cyber-purple/10 border border-cyber-purple/20 rounded-full tracking-tighter">AVG SLEEP: {stats!.avgSleep}h</div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#8B5CF666', fontSize: 9, fontWeight: 900}} 
                dy={10}
              />
              <YAxis domain={[0, 10]} hide={true} />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                name="Sleep"
                type="monotone" 
                dataKey="sleep" 
                stroke="#ADFF2F" 
                strokeWidth={2}
                dot={false}
                unit="/10"
              />
              <Line 
                name="Mood"
                type="monotone" 
                dataKey="mood" 
                stroke="#8B5CF6" 
                strokeWidth={2}
                dot={false}
                unit="/10"
              />
              <Line 
                name="Focus"
                type="monotone" 
                dataKey="focus" 
                stroke="#FF6B00" 
                strokeWidth={2}
                dot={false}
                unit="/10"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ProgressDashboard;

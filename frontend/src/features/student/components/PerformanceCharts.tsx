import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, TrendingUp, Activity, Award } from 'lucide-react';

// Premium Color Palette using HSL to match system theme
const COLORS = {
  primary: 'hsl(var(--primary))',
  secondary: '#0d9488', // Teal 600
  accent: '#8b5cf6',    // Violet 500
  success: '#10b981',   // Emerald 500
  warning: '#f59e0b',   // Amber 500
  muted: '#64748b'      // Slate 500
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
        <p className="text-xs font-black text-muted-foreground uppercase mb-1">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              <p className="text-sm font-bold">
                {entry.name}: <span className="text-primary">{entry.value}%</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const MasteryRadar: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: COLORS.muted, fontSize: 10, fontWeight: 700 }} 
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} axisLine={false} tick={false} />
          <Radar
            name="Mastery"
            dataKey="proficiency"
            stroke={COLORS.primary}
            fill={COLORS.primary}
            fillOpacity={0.5}
            animationBegin={300}
            animationDuration={1500}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const PerformanceTimeline: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: COLORS.muted, fontSize: 10 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: COLORS.muted, fontSize: 10 }}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={COLORS.primary}
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorScore)"
            animationBegin={500}
            animationDuration={2000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const EngagementMix: React.FC<{ summary: any }> = ({ summary }) => {
  const data = [
    { name: 'Quizzes', value: summary?.total_quizzes || 0, fill: COLORS.secondary },
    { name: 'Lessons', value: summary?.total_lessons || 0, fill: COLORS.accent },
    { name: 'AI Chat', value: summary?.ai_chats || 0, fill: COLORS.warning },
  ].filter(d => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: COLORS.muted, fontSize: 12, fontWeight: 700 }}
          />
          <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
          <Bar 
            dataKey="value" 
            radius={[0, 10, 10, 0]} 
            barSize={32}
            animationBegin={700}
            animationDuration={1500}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

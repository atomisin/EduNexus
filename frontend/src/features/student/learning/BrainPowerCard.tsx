import React from 'react';
import { BookOpen, Clock, Zap } from 'lucide-react';

export interface BrainPowerCardData {
  id: string;
  material_id: string;
  title: string;
  subject: string;
  topic: string;
  content: string;
  snippet: string;
  estimated_read_seconds: number;
  confidence_score: number;
  page_number?: number | null;
}

interface BrainPowerCardProps {
  card: BrainPowerCardData;
  onJumpIn: (card: BrainPowerCardData) => void;
}

export const BrainPowerCard: React.FC<BrainPowerCardProps> = ({ card, onJumpIn }) => {
  const readMinutes = Math.max(1, Math.round(card.estimated_read_seconds / 60));

  return (
    <div className="group relative overflow-hidden rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-br from-white to-indigo-50/30 dark:from-slate-900 dark:to-indigo-950/30 p-4 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
            <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
              {card.title}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-medium">
                {card.subject}
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" /> {readMinutes} min read
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Snippet */}
      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-3 leading-relaxed">
        {card.snippet}
      </p>

      {/* Action */}
      <button
        onClick={() => onJumpIn(card)}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors duration-200"
      >
        <Zap className="w-3.5 h-3.5" />
        Jump In
      </button>
    </div>
  );
};

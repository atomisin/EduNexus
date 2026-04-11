import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Brain, Network } from 'lucide-react';

const concepts = [
  { id: '1', name: 'Algebra', x: 50, y: 50, mastered: true },
  { id: '2', name: 'Linear Equations', x: 30, y: 30, mastered: true },
  { id: '3', name: 'Quadratic Equations', x: 70, y: 30, mastered: false },
  { id: '4', name: 'Polynomials', x: 50, y: 80, mastered: false },
  { id: '5', name: 'Factoring', x: 20, y: 60, mastered: true },
  { id: '6', name: 'Functions', x: 80, y: 60, mastered: false },
];

const connections = [
  { from: '1', to: '2' },
  { from: '1', to: '3' },
  { from: '1', to: '4' },
  { from: '2', to: '5' },
  { from: '3', to: '6' },
];

export const KnowledgeGraphView = () => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Knowledge Graph</h2>
        <p className="text-slate-500 mt-1">Visualize your learning journey and discover concept connections</p>
      </div>

      <Card className="overflow-hidden border-0 shadow-2xl shadow-slate-200/50 dark:shadow-none">
        <CardContent className="p-0">
          <div className="relative h-[500px] bg-gradient-to-br from-slate-50 via-indigo-50/30 to-indigo-50/30 dark:from-slate-900 dark:via-indigo-950/20 dark:to-indigo-950/20">
            {/* SVG Connections */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              {connections.map((conn, i) => {
                const from = concepts.find(c => c.id === conn.from);
                const to = concepts.find(c => c.id === conn.to);
                return (
                  <line
                    key={i}
                    x1={`${from?.x}%`}
                    y1={`${from?.y}%`}
                    x2={`${to?.x}%`}
                    y2={`${to?.y}%`}
                    stroke="url(#lineGradient)"
                    strokeWidth="2"
                    strokeDasharray="6,4"
                  />
                );
              })}
            </svg>

            {/* Concept Nodes */}
            {concepts.map((concept) => (
              <div
                key={concept.id}
                className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 hover:scale-110 ${concept.mastered
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-2 border-indigo-200 dark:border-indigo-800 shadow-lg'
                  }`}
                style={{ left: `${concept.x}%`, top: `${concept.y}%` }}
              >
                <div className="px-5 py-3 rounded-2xl font-medium text-sm whitespace-nowrap flex items-center gap-2">
                  {concept.mastered && <CheckCircle className="w-4 h-4" />}
                  {concept.name}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 text-center text-foreground">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
              <CheckCircle className="w-7 h-7 text-white" />
            </div>
            <p className="text-4xl font-bold">3</p>
            <p className="text-sm text-slate-500 mt-1">Mastered Concepts</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 text-center text-foreground">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <p className="text-4xl font-bold">3</p>
            <p className="text-sm text-slate-500 mt-1">Learning Now</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 text-center text-foreground">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
              <Network className="w-7 h-7 text-white" />
            </div>
            <p className="text-4xl font-bold">12</p>
            <p className="text-sm text-slate-500 mt-1">Total in Path</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

import { Trophy, Star, Zap, Brain, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  profile: {
    xp?: number;
    level?: number;
    current_streak?: number;
    seconds_until_recharge?: number;
    brain_power?: number;
  } | null;
  energy: number;
}

export const StatsCards = ({ profile, energy }: StatsCardsProps) => {
  const displayEnergy = energy ?? profile?.brain_power ?? 100;
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white border-0 shadow-lg">
        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
          <Trophy className="w-8 h-8 opacity-80 mb-2" />
          <div>
            <p className="text-2xl font-bold">{profile?.xp || 0}</p>
            <p className="text-xs opacity-80 uppercase tracking-wider font-bold">Total XP</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white dark:bg-slate-900 border-slate-100 shadow-sm">
        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-2">
            <Star className="w-6 h-6 text-amber-500" fill="currentColor" />
          </div>
          <div>
            <p className="text-2xl font-bold">Level {profile?.level || 1}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Current Rank</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white dark:bg-slate-900 border-slate-100 shadow-sm">
        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mb-2">
            <Zap className="w-6 h-6 text-rose-500" fill="currentColor" />
          </div>
          <div>
            <p className="text-2xl font-bold">{profile?.current_streak || 0}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Day Streak</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white dark:bg-slate-900 border-slate-100 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl font-bold text-primary">{displayEnergy}%</span>
            <Brain className="w-8 h-8 text-primary opacity-20" />
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${displayEnergy > 30 ? 'bg-primary' : 'bg-rose-500'}`}
              style={{ width: `${displayEnergy}%` }}
            />
          </div>
          {profile?.seconds_until_recharge && profile.seconds_until_recharge > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> 
              Recharges in {Math.floor(profile.seconds_until_recharge / 3600)}h {Math.floor((profile.seconds_until_recharge % 3600) / 60)}m
            </p>
          )}
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-2">Brain Power</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsCards;

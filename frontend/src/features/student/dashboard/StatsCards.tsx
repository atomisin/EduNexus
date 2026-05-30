import { Brain, Clock, Star, Trophy, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  profile: {
    xp?: number;
    level?: number;
    current_streak?: number;
    seconds_until_recharge?: number;
    brain_power?: number;
    approx_tokens_remaining?: number;
    daily_token_budget?: number;
  } | null;
  energy: number;
}

export const StatsCards = ({ profile, energy }: StatsCardsProps) => {
  const displayEnergy = energy ?? profile?.brain_power ?? 100;
  const tokensRemaining = profile?.approx_tokens_remaining;
  const dailyTokenBudget = profile?.daily_token_budget;
  const brainPowerMessage = (() => {
    if (typeof tokensRemaining !== 'number' || typeof dailyTokenBudget !== 'number') return null;
    const remainingRatio = dailyTokenBudget > 0 ? tokensRemaining / dailyTokenBudget : displayEnergy / 100;
    const usageRatio = 1 - remainingRatio;
    if (usageRatio < 0.7) return 'Sharp focus today. Fire on and keep the learning momentum.';
    if (remainingRatio > 0.1) return "Great effort. Start wrapping up soon so today's learning can settle.";
    return 'Strong work today. Rest, review, and return with fresh Brain Power.';
  })();

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <Card className="rounded-lg border-0 bg-primary text-primary-foreground shadow-sm">
        <CardContent className="flex min-h-[102px] flex-col justify-between p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80 sm:text-xs">Total XP</p>
              <p className="mt-2 text-2xl font-bold tracking-tight sm:text-[28px]">{profile?.xp || 0}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <Trophy className="h-5 w-5 opacity-90" />
            </div>
          </div>
          <p className="text-[11px] opacity-80">Keep the streak moving and this compounds fast.</p>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border bg-card shadow-sm">
        <CardContent className="flex min-h-[102px] flex-col justify-between p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">Current Rank</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Level {profile?.level || 1}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
              <Star className="h-5 w-5 text-amber-500" fill="currentColor" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Your steady work is what moves this upward.</p>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border bg-card shadow-sm">
        <CardContent className="flex min-h-[102px] flex-col justify-between p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">Day Streak</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">{profile?.current_streak || 0}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100">
              <Zap className="h-5 w-5 text-rose-500" fill="currentColor" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Short, regular sessions beat rare marathon study.</p>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border bg-card shadow-sm">
        <CardContent className="min-h-[102px] p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
                Brain Power
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-primary sm:text-[28px]">{displayEnergy}%</p>
            </div>
            <Brain className="h-7 w-7 text-primary opacity-20 sm:h-8 sm:w-8" />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-1000 ${displayEnergy > 30 ? 'bg-primary' : 'bg-rose-500'}`}
              style={{ width: `${displayEnergy}%` }}
            />
          </div>
          {brainPowerMessage ? (
            <p className="mt-2 text-[10px] text-muted-foreground">{brainPowerMessage}</p>
          ) : profile?.seconds_until_recharge && profile.seconds_until_recharge > 0 ? (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              Recharges in {Math.floor(profile.seconds_until_recharge / 3600)}h{' '}
              {Math.floor((profile.seconds_until_recharge % 3600) / 60)}m
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsCards;

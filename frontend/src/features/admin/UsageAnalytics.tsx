import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Legend, Cell
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminAPI } from '@/services/api';
import { Loader2, TrendingUp, DollarSign, Cpu, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ModelUsage {
  model_name: string;
  total_tokens: number;
  request_count: number;
  estimated_cost: number;
}

interface DailyTrend {
  date: string;
  tokens: number;
  cost: number;
}

interface TopUser {
  user_id: string;
  email: string;
  full_name: string;
  token_count: number;
  estimated_cost: number;
}

interface UsageData {
  summary: {
    total_tokens: number;
    total_requests: number;
    total_cost: number;
  };
  by_model: ModelUsage[];
  daily_trends: DailyTrend[];
  top_users: TopUser[];
}

export const UsageAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetchUsageData();
  }, [days]);

  const fetchUsageData = async () => {
    setLoading(true);
    try {
      const result = await adminAPI.getAIUsage({ days: parseInt(days) });
      setData(result);
    } catch (error: any) {
      toast.error('Failed to load usage analytics: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-500 animate-pulse">Analyzing token reservoirs...</p>
      </div>
    );
  }

  if (!data) return null;

  const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Resource Analytics</h2>
          <p className="text-muted-foreground text-sm">Monitor LLM token consumption and estimated costs across models and users.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Timeframe:</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-primary/10 shadow-sm overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-12 h-12 text-primary" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Cpu className="w-4 h-4" /> Total Tokens
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{data.summary.total_tokens.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Across {data.summary.total_requests} AI interactions</p>
          </CardContent>
        </Card>

        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-primary/10 shadow-sm overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <DollarSign className="w-12 h-12 text-amber-500" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-amber-600">
              <DollarSign className="w-4 h-4" /> Est. Cost (USD)
            </CardDescription>
            <CardTitle className="text-3xl font-bold">${data.summary.total_cost.toFixed(4)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Calculated based on model rates</p>
          </CardContent>
        </Card>

        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-primary/10 shadow-sm overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Users className="w-12 h-12 text-green-500" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-600">
              <Users className="w-4 h-4" /> Active AI Users
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{data.top_users.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Unique contributors this period</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Daily Cost Trend
            </CardTitle>
            <CardDescription>Estimated daily expenditure in USD</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_trends}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px' }}
                  itemStyle={{ color: '#818cf8' }}
                />
                <Area type="monotone" dataKey="cost" stroke="#6366f1" fillOpacity={1} fill="url(#colorCost)" name="Cost (USD)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tokens Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-amber-500" />
              Token Consumption
            </CardTitle>
            <CardDescription>Daily total tokens generated</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily_trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px' }}
                  itemStyle={{ color: '#f59e0b' }}
                />
                <Bar dataKey="tokens" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Tokens" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Usage by Model */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Model Distribution</CardTitle>
            <CardDescription>Share of tokens by LLM model</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_model} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="model_name" 
                  type="category" 
                  tick={{ fontSize: 10 }} 
                  width={100}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px' }}
                />
                <Bar dataKey="total_tokens" name="Tokens" radius={[0, 4, 4, 0]}>
                  {data.by_model.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Users Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top AI Consumers</CardTitle>
            <CardDescription>Users with highest token attribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">User</th>
                    <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground">Tokens</th>
                    <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground">Cost</th>
                    <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground">Attribution %</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {data.top_users.map((u, i) => (
                    <tr key={u.user_id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-2 align-middle">
                        <div className="flex flex-col">
                          <span className="font-medium">{u.full_name || 'System User'}</span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </td>
                      <td className="p-2 align-middle text-right font-mono">{u.token_count.toLocaleString()}</td>
                      <td className="p-2 align-middle text-right font-mono">${u.estimated_cost.toFixed(4)}</td>
                      <td className="p-2 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs">{((u.token_count / data.summary.total_tokens) * 100).toFixed(1)}%</span>
                          <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-primary h-full" 
                              style={{ width: `${(u.token_count / data.summary.total_tokens) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.top_users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No user-attributed usage found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 flex gap-4">
        <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
        <div>
          <h4 className="font-semibold text-amber-800 dark:text-amber-400">Financial Accuracy Disclaimer</h4>
          <p className="text-sm text-amber-700 dark:text-amber-500/80">
            Costs are estimates based on standard API rates for input and output tokens. Actual Groq/OpenAI/Anthropic billing may vary based on specific prompt overheads and regional taxes.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UsageAnalytics;

import { Brain, Sparkles, Volume2, Mic } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import type { AIConfig } from '@/types';

interface AITogglePanelProps {
  config: AIConfig;
  onChange: (config: AIConfig) => void;
}

export const AITogglePanel = ({ config, onChange }: AITogglePanelProps) => {
  return (
    <Card className="border border-border bg-background shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground">
          <Brain className="w-4 h-4 text-primary" />
          Teaching support
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">LLM Explanations</span>
          </div>
          <Switch
            checked={config.llmEnabled}
            onCheckedChange={(v) => onChange({ ...config, llmEnabled: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Text-to-Speech</span>
          </div>
          <Switch
            checked={config.ttsEnabled}
            onCheckedChange={(v) => onChange({ ...config, ttsEnabled: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium">Speech-to-Text</span>
          </div>
          <Switch
            checked={config.sttEnabled}
            onCheckedChange={(v) => onChange({ ...config, sttEnabled: v })}
          />
        </div>

        <Separator className="bg-border" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Auto-Generate Explanations</span>
            <Switch
              checked={config.autoExplain}
              onCheckedChange={(v) => onChange({ ...config, autoExplain: v })}
              disabled={!config.llmEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Suggest YouTube Videos</span>
            <Switch
              checked={config.suggestVideos}
              onCheckedChange={(v) => onChange({ ...config, suggestVideos: v })}
              disabled={!config.llmEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Auto-Generate Assignments</span>
            <Switch
              checked={config.generateAssignments}
              onCheckedChange={(v) => onChange({ ...config, generateAssignments: v })}
              disabled={!config.llmEnabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

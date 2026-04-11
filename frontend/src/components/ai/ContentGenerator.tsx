import { useState } from 'react';
import { BookOpen, Sparkles, FileText, Lightbulb, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ragAPI } from '@/services/api';

interface ContentGeneratorProps {
  subject?: string;
  onContentGenerated?: (content: string, type: string) => void;
}

export function ContentGenerator({ subject, onContentGenerated }: ContentGeneratorProps) {
  const [activeTab, setActiveTab] = useState('explain');
  const [topic, setTopic] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(subject || '');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [targetAudience, setTargetAudience] = useState('student');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [studyGuideTopics, setStudyGuideTopics] = useState('');

  const handleExplain = async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    setResult(null);
    
    try {
      const response = await ragAPI.explainTopic(topic, selectedSubject || undefined);
      const content = response.explanation || response.content || response.response || JSON.stringify(response, null, 2);
      setResult(content);
      onContentGenerated?.(content, 'explanation');
    } catch (error: any) {
      setResult(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    setResult(null);
    
    try {
      const response = await ragAPI.generateContent({
        query: topic,
        subject: selectedSubject || undefined,
        difficulty_level: difficulty,
        target_audience: targetAudience,
      });
      const content = response.content || response.response || JSON.stringify(response, null, 2);
      setResult(content);
      onContentGenerated?.(content, 'generated');
    } catch (error: any) {
      setResult(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudyGuide = async () => {
    if (!selectedSubject.trim()) return;
    setIsLoading(true);
    setResult(null);
    
    try {
      const topics = studyGuideTopics.split('\n').filter(t => t.trim());
      const response = await ragAPI.createStudyGuide(selectedSubject, topics.length > 0 ? topics : undefined);
      const content = response.study_guide || response.content || response.response || JSON.stringify(response, null, 2);
      setResult(content);
      onContentGenerated?.(content, 'study_guide');
    } catch (error: any) {
      setResult(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (result) {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          AI Content Generator
        </CardTitle>
        <CardDescription>
          Generate explanations, study guides, and practice content using AI
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="explain" className="gap-1">
              <Lightbulb className="w-4 h-4" />
              Explain
            </TabsTrigger>
            <TabsTrigger value="generate" className="gap-1">
              <FileText className="w-4 h-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="studyguide" className="gap-1">
              <BookOpen className="w-4 h-4" />
              Study Guide
            </TabsTrigger>
          </TabsList>

          <TabsContent value="explain" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic</label>
                <Input
                  placeholder="e.g., Quadratic equations"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject (optional)</label>
                <Input
                  placeholder="e.g., Mathematics"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleExplain} disabled={isLoading || !topic.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Explaining...
                </>
              ) : (
                <>
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Explain Topic
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="generate" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic / Query</label>
                <Input
                  placeholder="What content do you need?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <Input
                  placeholder="e.g., Physics"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty</label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Audience</label>
                <Select value={targetAudience} onValueChange={setTargetAudience}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleGenerateContent} disabled={isLoading || !topic.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="studyguide" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject</label>
              <Input
                placeholder="e.g., Chemistry"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Specific Topics (one per line, optional)</label>
              <Textarea
                placeholder="Organic chemistry&#10;Periodic table&#10;Chemical bonds"
                value={studyGuideTopics}
                onChange={(e) => setStudyGuideTopics(e.target.value)}
                rows={4}
              />
            </div>
            <Button onClick={handleStudyGuide} disabled={isLoading || !selectedSubject.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4 mr-2" />
                  Create Study Guide
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {result && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Generated Content</label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg max-h-[400px] overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">{result}</pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

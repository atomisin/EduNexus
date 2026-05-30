import React, { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adminAPI } from '@/services/api';
import { Loader2, Plus, RefreshCw, Save, Video } from 'lucide-react';
import { toast } from 'sonner';

type VideoCreatorProfile = {
  id: string;
  creator_name: string;
  channel_aliases: string[];
  domains: string[];
  topic_keywords: string[];
  recommended_query_terms: string[];
  community_evidence_count: number;
  community_evidence_summary?: string | null;
  source_notes?: string | null;
  is_active: boolean;
  sort_order: number;
};

const emptyForm = {
  creator_name: '',
  channel_aliases: '',
  domains: '',
  topic_keywords: '',
  recommended_query_terms: '',
  community_evidence_count: '0',
  community_evidence_summary: '',
  source_notes: '',
  is_active: true,
  sort_order: '0',
};

const csvToList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const VideoCreatorProfilesPanel: React.FC = () => {
  const [profiles, setProfiles] = useState<VideoCreatorProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getVideoCreatorProfiles(true);
      setProfiles(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(`Failed to load video evidence profiles: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) || null,
    [profiles, selectedId],
  );

  useEffect(() => {
    if (!selectedProfile) return;
    setForm({
      creator_name: selectedProfile.creator_name || '',
      channel_aliases: (selectedProfile.channel_aliases || []).join(', '),
      domains: (selectedProfile.domains || []).join(', '),
      topic_keywords: (selectedProfile.topic_keywords || []).join(', '),
      recommended_query_terms: (selectedProfile.recommended_query_terms || []).join(', '),
      community_evidence_count: String(selectedProfile.community_evidence_count || 0),
      community_evidence_summary: selectedProfile.community_evidence_summary || '',
      source_notes: selectedProfile.source_notes || '',
      is_active: Boolean(selectedProfile.is_active),
      sort_order: String(selectedProfile.sort_order || 0),
    });
  }, [selectedProfile]);

  const resetForm = () => {
    setSelectedId(null);
    setForm(emptyForm);
  };

  const saveProfile = async () => {
    if (!form.creator_name.trim()) {
      toast.error('Creator name is required.');
      return;
    }
    setSaving(true);
    const payload = {
      creator_name: form.creator_name.trim(),
      channel_aliases: csvToList(form.channel_aliases),
      domains: csvToList(form.domains),
      topic_keywords: csvToList(form.topic_keywords),
      recommended_query_terms: csvToList(form.recommended_query_terms),
      community_evidence_count: parseInt(form.community_evidence_count || '0', 10) || 0,
      community_evidence_summary: form.community_evidence_summary.trim() || undefined,
      source_notes: form.source_notes.trim() || undefined,
      is_active: form.is_active,
      sort_order: parseInt(form.sort_order || '0', 10) || 0,
    };
    try {
      if (selectedId) {
        await adminAPI.updateVideoCreatorProfile(selectedId, payload);
        toast.success('Video evidence profile updated.');
      } else {
        await adminAPI.createVideoCreatorProfile(payload);
        toast.success('Video evidence profile created.');
      }
      await fetchProfiles();
      resetForm();
    } catch (error: any) {
      toast.error(error?.message || 'Could not save video evidence profile.');
    } finally {
      setSaving(false);
    }
  };

  const seedProfiles = async () => {
    setSaving(true);
    try {
      const result = await adminAPI.seedVideoCreatorProfiles();
      toast.success(`${result?.created ?? 0} created, ${result?.updated ?? 0} refreshed from the seed catalog.`);
      await fetchProfiles();
    } catch (error: any) {
      toast.error(error?.message || 'Could not seed profiles.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-primary text-primary-foreground">{profiles.length} creator evidence profiles</Badge>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={seedProfiles} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Seed / refresh defaults
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={resetForm}>
          <Plus className="mr-2 h-4 w-4" />
          New profile
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card className="rounded-lg border-border shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Video className="h-5 w-5 text-primary" />
              Stored creator evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : profiles.length === 0 ? (
              <Alert>
                <AlertDescription>No video evidence profiles yet. Seed the defaults or add your own.</AlertDescription>
              </Alert>
            ) : (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedId(profile.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedId === profile.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{profile.creator_name}</p>
                    <Badge variant="outline" className={profile.is_active ? 'border-emerald-500 text-emerald-600' : 'border-slate-300 text-slate-500'}>
                      {profile.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Domains: {(profile.domains || []).join(', ') || 'None'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Evidence count: {profile.community_evidence_count} | Sort order: {profile.sort_order}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">{selectedId ? 'Edit creator evidence profile' : 'Add creator evidence profile'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Creator name</Label>
              <Input value={form.creator_name} onChange={(e) => setForm((prev) => ({ ...prev, creator_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Channel aliases</Label>
              <Input value={form.channel_aliases} onChange={(e) => setForm((prev) => ({ ...prev, channel_aliases: e.target.value }))} placeholder="abdul bari, abdulbari lectures" />
            </div>
            <div className="space-y-2">
              <Label>Domains</Label>
              <Input value={form.domains} onChange={(e) => setForm((prev) => ({ ...prev, domains: e.target.value }))} placeholder="algorithms, computer science" />
            </div>
            <div className="space-y-2">
              <Label>Topic keywords</Label>
              <Textarea value={form.topic_keywords} onChange={(e) => setForm((prev) => ({ ...prev, topic_keywords: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Recommended query terms</Label>
              <Textarea value={form.recommended_query_terms} onChange={(e) => setForm((prev) => ({ ...prev, recommended_query_terms: e.target.value }))} rows={2} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Community evidence count</Label>
                <Input type="number" min={0} value={form.community_evidence_count} onChange={(e) => setForm((prev) => ({ ...prev, community_evidence_count: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Sort order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Evidence summary</Label>
              <Textarea value={form.community_evidence_summary} onChange={(e) => setForm((prev) => ({ ...prev, community_evidence_summary: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Source notes</Label>
              <Textarea value={form.source_notes} onChange={(e) => setForm((prev) => ({ ...prev, source_notes: e.target.value }))} rows={3} />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant={form.is_active ? 'default' : 'outline'}
                className="rounded-lg"
                onClick={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
              >
                {form.is_active ? 'Active profile' : 'Inactive profile'}
              </Button>
              <Button type="button" className="rounded-lg" onClick={saveProfile} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VideoCreatorProfilesPanel;

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminAPI } from '@/services/api';
import { Loader2, Mail, ShieldAlert, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type CustomCourseRequest = {
  id: string;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  requested_title: string;
  normalized_title?: string | null;
  requested_description?: string | null;
  intended_outcome?: string | null;
  motivation?: string | null;
  status: string;
  safety_status: string;
  safety_flags: string[];
  suggested_courses: string[];
  safe_alternatives: string[];
  refined_admin_message?: string | null;
  admin_selected_suggestion?: string | null;
  approved_course_name?: string | null;
  created_at?: string | null;
};

export const CustomCourseRequestsPanel: React.FC = () => {
  const [requests, setRequests] = useState<CustomCourseRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [suggestionById, setSuggestionById] = useState<Record<string, string>>({});
  const [clarificationById, setClarificationById] = useState<Record<string, string>>({});

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getCustomCourseRequests(false);
      setRequests(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(`Failed to load custom course requests: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const suspiciousCount = useMemo(
    () => requests.filter((request) => request.safety_status === 'suspicious').length,
    [requests],
  );

  const statusBadge = (request: CustomCourseRequest) => {
    if (request.safety_status === 'suspicious') {
      return <Badge className="bg-red-600 text-white hover:bg-red-600">Suspicious</Badge>;
    }
    if (request.status === 'clarification_requested') {
      return <Badge className="bg-primary text-primary-foreground">Clarification requested</Badge>;
    }
    if (request.status === 'suggested_existing_course') {
      return <Badge className="bg-primary text-primary-foreground">Suggestion sent</Badge>;
    }
    return <Badge className="bg-primary text-primary-foreground">Pending review</Badge>;
  };

  const previewDraft = async (requestId: string) => {
    const adminReason = reasonById[requestId]?.trim();
    if (!adminReason) {
      toast.error('Add a rejection reason first.');
      return;
    }
    setWorkingId(requestId);
    try {
      const data = await adminAPI.previewCustomCourseRejectionDraft(requestId, adminReason);
      setDraftById((prev) => ({ ...prev, [requestId]: data?.draft || '' }));
      toast.success('Suggested rejection email drafted.');
    } catch (error: any) {
      toast.error(`Could not draft rejection email: ${error.message || 'Unknown error'}`);
    } finally {
      setWorkingId(null);
    }
  };

  const submitAction = async (
    requestId: string,
    payload: {
      action: string;
      admin_reason?: string;
      selected_suggestion?: string;
      clarification_message?: string;
      email_message?: string;
      send_email?: boolean;
    },
    successMessage: string,
  ) => {
    setWorkingId(requestId);
    try {
      await adminAPI.reviewCustomCourseRequest(requestId, payload);
      toast.success(successMessage);
      await fetchRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Action failed');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertDescription>No custom course requests need admin attention right now.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-lg border border-border bg-background shadow-none">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.25fr_1fr]">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
              Governance brief
            </Badge>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">Review course intent before approval</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Safe requests can be routed into existing courses or approved for generation. Suspicious requests stay in explicit admin hands.
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open requests</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{requests.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suspicious</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{suspiciousCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-primary text-primary-foreground">{requests.length} open requests</Badge>
        {suspiciousCount > 0 ? (
          <Badge className="bg-red-600 text-white hover:bg-red-600">{suspiciousCount} suspicious</Badge>
        ) : null}
      </div>

      {requests.map((request) => {
        const activeSuggestion =
          suggestionById[request.id] ||
          request.admin_selected_suggestion ||
          request.suggested_courses?.[0] ||
          request.normalized_title ||
          request.requested_title;
        const working = workingId === request.id;

        return (
          <Card key={request.id} className="rounded-lg border-border shadow-none">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-lg">{request.requested_title}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{request.student_name || 'Learner'}</span>
                    <span>{request.student_email || ''}</span>
                  </div>
                </div>
                {statusBadge(request)}
              </div>
              {request.safety_flags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {request.safety_flags.map((flag) => (
                    <Badge key={flag} variant="outline" className={request.safety_status === 'suspicious' ? 'border-red-500 text-red-600' : ''}>
                      {flag.replaceAll('_', ' ')}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {request.requested_description ? (
                <div className="space-y-1">
                  <Label>Description</Label>
                  <p className="text-sm text-muted-foreground">{request.requested_description}</p>
                </div>
              ) : null}

              {request.intended_outcome ? (
                <div className="space-y-1">
                  <Label>Intended outcome</Label>
                  <p className="text-sm text-muted-foreground">{request.intended_outcome}</p>
                </div>
              ) : null}

              {request.safe_alternatives?.length ? (
                <div className="space-y-1">
                  <Label>Safe alternatives</Label>
                  <p className="text-sm text-muted-foreground">{request.safe_alternatives.join(', ')}</p>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Closest sensible course</Label>
                  <Select
                    value={activeSuggestion}
                    onValueChange={(value) => setSuggestionById((prev) => ({ ...prev, [request.id]: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a related course" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set([
                        ...(request.suggested_courses || []),
                        request.normalized_title || '',
                        request.requested_title,
                      ].filter(Boolean))].map((suggestion) => (
                        <SelectItem key={suggestion} value={suggestion}>
                          {suggestion}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={working || !activeSuggestion}
                      onClick={() =>
                        submitAction(
                          request.id,
                          { action: 'suggest_existing_course', selected_suggestion: activeSuggestion },
                          `Sent ${activeSuggestion} to the learner.`,
                        )
                      }
                    >
                      {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Suggest course
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg"
                      disabled={working}
                      onClick={() =>
                        submitAction(
                          request.id,
                          {
                            action: 'approve',
                            selected_suggestion: activeSuggestion,
                            send_email: true,
                          },
                          'Course approved and generation started.',
                        )
                      }
                    >
                      Approve
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Clarification message</Label>
                  <Textarea
                    value={clarificationById[request.id] || ''}
                    onChange={(event) =>
                      setClarificationById((prev) => ({ ...prev, [request.id]: event.target.value }))
                    }
                    placeholder="Tell the learner what needs to be clearer."
                    className="min-h-[100px]"
                  />
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    disabled={working || !(clarificationById[request.id] || '').trim()}
                    onClick={() =>
                      submitAction(
                        request.id,
                        {
                          action: 'request_clarification',
                          clarification_message: clarificationById[request.id],
                        },
                        'Clarification request sent.',
                      )
                    }
                  >
                    Ask for clarification
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  <Label className="text-sm">Rejection workflow</Label>
                </div>
                <Input
                  value={reasonById[request.id] || ''}
                  onChange={(event) => setReasonById((prev) => ({ ...prev, [request.id]: event.target.value }))}
                  placeholder="Short internal reason for rejection"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    disabled={working || !(reasonById[request.id] || '').trim()}
                    onClick={() => previewDraft(request.id)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Draft rejection email
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    disabled={working || !(reasonById[request.id] || '').trim()}
                    onClick={() =>
                      submitAction(
                        request.id,
                        {
                          action: 'reject',
                          admin_reason: reasonById[request.id],
                          email_message: draftById[request.id],
                          send_email: true,
                        },
                        'Rejection sent to learner.',
                      )
                    }
                  >
                    Reject and send
                  </Button>
                </div>
                <Textarea
                  value={draftById[request.id] || request.refined_admin_message || ''}
                  onChange={(event) => setDraftById((prev) => ({ ...prev, [request.id]: event.target.value }))}
                  placeholder="Suggested rejection email will appear here."
                  className="min-h-[140px]"
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default CustomCourseRequestsPanel;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
import { useState, useEffect, useMemo, Component, type ReactNode } from 'react';
import {
    LiveKitRoom,
    VideoConference,
    GridLayout,
    ParticipantTile,
    RoomAudioRenderer,
    ControlBar,
    useTracks,
    useLocalParticipant,
    useRoomContext,
} from '@livekit/components-react';
import { RoomEvent, LocalVideoTrack } from 'livekit-client';
import '@livekit/components-styles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Video, MessageSquare, X, Sparkles, BarChart3, ChevronRight, FileText, PenTool, Camera, LogOut, Volume2, Mic, BookOpen, Maximize2, Zap, Activity, BarChart2, Users, Clock } from 'lucide-react';
import { SessionMetrics } from './SessionMetrics';
import { Whiteboard } from './Whiteboard';
import { VirtualBackgroundControl } from './VirtualBackgroundControl';
import { sessionAPI, engagementAPI, aiAPI } from '@/services/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FloatingContentModal } from './FloatingContentModal';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { SessionCompetencyUpdate } from '@/types';

const smartPrepText = (value: any): string => {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(smartPrepText).filter(Boolean).join("; ");
    if (typeof value === "object") {
        for (const key of ["text", "point", "title", "objective", "content", "description", "explanation", "task"]) {
            if (value[key]) return smartPrepText(value[key]);
        }
        return Object.entries(value)
            .map(([key, item]) => {
                const text = smartPrepText(item);
                return text ? `${key.replace(/_/g, " ")}: ${text}` : "";
            })
            .filter(Boolean)
            .join("; ");
    }
    return String(value).trim();
};

const toList = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(smartPrepText).filter(Boolean);
    return smartPrepText(value).split(/[\n;]/).map((item) => item.replace(/^[-*\d.]\s*/, '').trim()).filter(Boolean);
};

const assignmentMarkdown = (assignment: any): string => {
    if (!assignment) return "";
    if (typeof assignment === "string") return assignment.trim();
    const title = smartPrepText(assignment.title);
    const instructions = smartPrepText(assignment.instructions);
    const tasks = toList(assignment.tasks || assignment.questions);
    return [
        title ? `### ${title}` : "",
        instructions,
        tasks.length ? tasks.map((task, index) => `${index + 1}. ${task}`).join("\n") : "",
    ].filter(Boolean).join("\n\n");
};

const answerToIndex = (answer: any): number | null => {
    if (typeof answer === 'number' && Number.isFinite(answer)) return answer;
    if (typeof answer === 'string') {
        const trimmed = answer.trim();
        if (/^[A-D]$/i.test(trimmed)) return trimmed.toUpperCase().charCodeAt(0) - 65;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) return numeric;
    }
    return null;
};

const normalizeQuizQuestions = (quiz: any): any[] => {
    const rawQuestions = Array.isArray(quiz) ? quiz : Array.isArray(quiz?.questions) ? quiz.questions : [];

    return rawQuestions
        .map((question: any, index: number) => {
            const options = Array.isArray(question?.options)
                ? question.options
                : Array.isArray(question?.choices)
                    ? question.choices
                    : [];
            const correctIndex = answerToIndex(
                question?.correct_index ??
                question?.correctAnswer ??
                question?.correct_answer ??
                question?.answer
            );
            const text = smartPrepText(question?.text || question?.question || question?.prompt);

            if (!text || options.length < 2 || correctIndex == null || correctIndex < 0 || correctIndex >= options.length) {
                return null;
            }

            return {
                id: question?.id || `pop-${Date.now()}-${index}`,
                text,
                question: text,
                options: options.map(smartPrepText),
                correct_index: correctIndex,
                correct_answer: String.fromCharCode(65 + correctIndex),
                explanation: smartPrepText(question?.explanation) || "Review the key idea from today's lesson.",
            };
        })
        .filter(Boolean);
};

const formatCountdown = (seconds: number) => {
    const normalized = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(normalized / 60);
    const secs = normalized % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const parseSessionTimestamp = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
};

const letterFromIndex = (value: any): string => {
    const index = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(index) || index < 0) return '-';
    return String.fromCharCode(65 + index);
};

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class VideoErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        if (error.message && error.message.includes('getImageData')) {
            console.warn('LiveKit video error caught by boundary:', error.message);
            return { hasError: false, error: null };
        }
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        if (error.message && error.message.includes('getImageData')) {
            console.warn('LiveKit video processing error suppressed');
            return;
        }
        console.error('LiveKit room error:', error, errorInfo);
    }

    render() {
        return this.props.children;
    }
}

// Helper Component to handle Room Context and DataChannels
const SessionContent = ({
    isTeacher,
    isGuest,
    guestAccessCode,
    guestName,
    sessionId,
    sessionData,
    activePopQuiz,
    setActivePopQuiz,
    reactions,
    setReactions,
    title,
    setAiContent,
    setShowAiContent,
    floatingContent,
    setFloatingContent,
    localVideoTrack,
    showVirtualBg,
    setShowVirtualBg
}: any) => {
    const room = useRoomContext();
    const nextPreparedLiveQuiz = useMemo(() => {
        const sequence = sessionData?.context?.live_pop_quizzes;
        if (!Array.isArray(sequence) || sequence.length === 0) return null;
        const nextIndex = Math.max(0, Number(sessionData?.context?.next_live_quiz_marker_index || 0));
        return sequence[nextIndex] || null;
    }, [sessionData]);

    useEffect(() => {
        if (!room) return;

        const handleData = (payload: Uint8Array) => {
            const decoder = new TextDecoder();
            const data = JSON.parse(decoder.decode(payload));

            if (data.type === 'REACTION') {
                const id = Date.now();
                setReactions((prev: any) => [...prev, { id, emoji: data.emoji }]);
                setTimeout(() => {
                    setReactions((prev: any) => prev.filter((r: any) => r.id !== id));
                }, 3000);
            } else if (data.type === 'POP_QUIZ') {
                setFloatingContent({
                    type: 'pop_quiz',
                    content: data.quiz
                });
                window.setTimeout(() => window.dispatchEvent(new Event('edunexus:notifications-refresh')), 1500);
                toast(`New Pop Quiz: ${data.quiz.title}`, { icon: '\uD83D\uDCDD', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            } else if (data.type === 'AI_CONTENT') {
                setFloatingContent({
                    type: 'notes',
                    content: data.data
                });
                setAiContent(data.data);
                window.setTimeout(() => window.dispatchEvent(new Event('edunexus:notifications-refresh')), 1500);
                toast(`Teacher shared new lesson material!`, { icon: '\uD83D\uDCDA', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            }
        };

        room.on(RoomEvent.DataReceived, handleData);

        // Student Monitoring: Periodic video frame capture
        let monitoringInterval: ReturnType<typeof setInterval>;
        if (!isTeacher && !isGuest) {
            monitoringInterval = setInterval(async () => {
                const lp = room.localParticipant;
                const trackPublication = Array.from(lp.trackPublications.values())
                    .find(p => p.source === 'camera' || (p.track && p.track.kind === 'video'));
                
                const videoTrack = trackPublication?.track as LocalVideoTrack | undefined;
                
                if (videoTrack) {
                    try {
                        const canvas = document.createElement('canvas');
                        const videoElement = videoTrack.attachedElements[0] as HTMLVideoElement;
                        if (videoElement && videoElement.readyState >= 2) {
                            canvas.width = videoElement.videoWidth / 4; // Downscale
                            canvas.height = videoElement.videoHeight / 4;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                            const frameData = canvas.toDataURL('image/jpeg', 0.5);
                            await engagementAPI.submitVideoFrame(sessionId, room.localParticipant.identity, frameData);
                        }
                    } catch (e) {
                        console.warn("Frame capture failed:", e);
                    }
                }
            }, 5000); // Every 5 seconds
        }

        return () => {
            room.off(RoomEvent.DataReceived, handleData);
            if (monitoringInterval) clearInterval(monitoringInterval);
        };
    }, [room, setReactions, setActivePopQuiz, setAiContent, setShowAiContent]);

    const sendReaction = async (emoji: string) => {
        if (!room) return;
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify({ type: 'REACTION', emoji }));
        room.localParticipant.publishData(data, { reliable: true });

        // Also show locally
        const id = Date.now();
        setReactions((prev: any) => [...prev, { id, emoji }]);
        setTimeout(() => {
            setReactions((prev: any) => prev.filter((r: any) => r.id !== id));
        }, 3000);

        // Record participation for XP
        if (!isGuest) {
            try {
                await engagementAPI.recordParticipation(sessionId, 'reaction');
            } catch (error) {
                console.error('Failed to record reaction participation:', error);
            }
        }
    };

    const triggerPopQuiz = async () => {
        if (!room) return;
        try {
            toast.info("Loading the next saved lesson quiz...");
            const [latestSessionResponse, shared] = await Promise.all([
                sessionAPI.get(sessionId).catch(() => null),
                sessionAPI.getSharedContent(sessionId).catch(() => null),
            ]);
            const latestSession = latestSessionResponse?.session || latestSessionResponse;
            const materials = latestSession?.context?.lesson_materials || {};
            const assessmentMeta = latestSession?.context?.assessment_artifacts || {};
            const liveQuizSequence = Array.isArray(latestSession?.context?.live_pop_quizzes)
                ? latestSession.context.live_pop_quizzes
                : [];
            const nextMarkerIndex = Math.max(0, Number(latestSession?.context?.next_live_quiz_marker_index || 0));
            const preparedLiveQuiz = liveQuizSequence[nextMarkerIndex] || null;
            const quizCandidates = [
                preparedLiveQuiz,
                latestSession?.context?.active_pop_quiz,
                materials.pop_quiz,
                latestSession?.pre_session_quiz,
                shared?.pop_quiz,
            ];

            let questions: any[] = [];
            const currentTopic = latestSession?.context?.topic || shared?.topic || title || 'Quick Check';
            let quizTitle = preparedLiveQuiz?.title || `In-class quiz: ${currentTopic}`;
            let markerId = preparedLiveQuiz?.marker_id || null;
            let markerLabel = preparedLiveQuiz?.marker_label || null;
            for (const candidate of quizCandidates) {
                const normalized = normalizeQuizQuestions(candidate);
                if (normalized.length) {
                    questions = normalized;
                    const candidateTitle = smartPrepText(candidate?.title);
                    if (candidateTitle && !/pre[-\s]?session/i.test(candidateTitle)) {
                        quizTitle = candidateTitle;
                    }
                    markerId = candidate?.marker_id || markerId;
                    markerLabel = candidate?.marker_label || markerLabel;
                    break;
                }
            }

            if (!questions.length) {
                toast.error("No saved pop quiz is available for this session yet.");
                return;
            }

            const quizPayload = { title: quizTitle, questions, marker_id: markerId, marker_label: markerLabel };
            const popQuizMeta = assessmentMeta?.pop_quiz || {};
            const encoder = new TextEncoder();
            await sessionAPI.pushContent(sessionId, {
                content_type: 'pop_quiz',
                content: quizPayload,
            });
            const data = encoder.encode(JSON.stringify({
                type: 'POP_QUIZ',
                quiz: quizPayload
            }));
            room.localParticipant.publishData(data, { reliable: true });
            if (popQuizMeta?.validation?.used_fallback) {
                toast.success(`${markerLabel || 'Pop Quiz'} triggered. Using the safe fallback version for this class.`, { style: { color: '#fff', background: '#0d9488', fontWeight: '600' } });
            } else {
                toast.success(`${markerLabel || 'Pop Quiz'} triggered for all students!`, { style: { color: '#fff', background: '#0d9488', fontWeight: '600' } });
            }
        } catch (error) {
            console.error("Failed to trigger saved pop quiz:", error);
            toast.error("Failed to trigger pop quiz");
        }
    };

    return (
        <div className="relative h-full flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 min-h-0 overflow-hidden relative">
                <VideoConference />
            </div>

            {/* Reaction Overlay */}
            <div className="absolute inset-x-0 bottom-32 pointer-events-none flex justify-center z-50">
                <div className="relative w-full max-w-lg h-64 overflow-hidden">
                    {reactions.map((r: any) => (
                        <div
                            key={r.id}
                            className="absolute bottom-0 animate-bounce-up text-4xl"
                            style={{
                                left: `${Math.random() * 80 + 10}%`,
                                animationDuration: `${2 + Math.random()}s`
                            }}
                        >
                            {r.emoji}
                        </div>
                    ))}
                </div>
            </div>

            {/* Interaction Bar */}
            <div className="absolute bottom-14 left-1/2 z-40 flex w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 items-center justify-center gap-2 overflow-x-auto rounded-full border border-border bg-background/95 p-2 shadow-lg backdrop-blur-md sm:bottom-16 sm:w-auto">
                {!isTeacher && (
                    <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-r border-border pr-2">
                        {['\uD83D\uDC4D', '\u2764\uFE0F', '\uD83D\uDC4F', '\uD83D\uDE2E', '\uD83E\uDD14', '\uD83D\uDD25'].map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => sendReaction(emoji)}
                                className="flex h-8 items-center justify-center rounded-full px-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary/10"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
                {isTeacher && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={triggerPopQuiz}
                        className="shrink-0 rounded-full gap-2 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
                    >
                        <Sparkles className="w-4 h-4" />
                        {nextPreparedLiveQuiz?.marker_label ? `Send ${nextPreparedLiveQuiz.marker_label}` : 'Trigger Pop Quiz'}
                    </Button>
                )}
            </div>

            {/* Floating Content Modal for Students */}
            {floatingContent && !isTeacher && (
                <FloatingContentModal
                    contentType={floatingContent.type}
                    content={floatingContent.content}
                    onClose={() => setFloatingContent(null)}
                    onSubmitQuiz={async (answers) => {
                        const res = isGuest
                            ? await sessionAPI.submitGuestLiveQuiz(sessionId, {
                                access_code: guestAccessCode,
                                student_name: guestName,
                                guest_identity: room.localParticipant.identity,
                                answers,
                            })
                            : await sessionAPI.submitLiveQuiz(sessionId, answers);
                        
                        // Send results back to teacher via LiveKit
                        const encoder = new TextEncoder();
                        const data = encoder.encode(JSON.stringify({
                            type: 'QUIZ_RESPONSE',
                            studentId: room.localParticipant.identity,
                            studentName: room.localParticipant.name,
                            score: res.score,
                            isCorrect: res.score === 100
                        }));
                        room.localParticipant.publishData(data, { reliable: true });
                        
                        return res;
                    }}
                />
            )}

            <VirtualBackgroundControl
                localVideoTrack={localVideoTrack}
                isOpen={showVirtualBg}
                onClose={() => setShowVirtualBg(false)}
            />
        </div>
    );
};

interface LiveSessionRoomProps {
    sessionId: string;
    token?: string;
    roomName?: string;
    serverUrl?: string;
    onDisconnect: () => void;
    title?: string;
    isTeacher: boolean;
    sessionTitle?: string;
    studentName?: string;
    isGuest?: boolean;
    guestAccessCode?: string;
    initialSessionData?: any;
    onLeave?: () => void;
    isTheaterMode?: boolean;
    onToggleTheater?: () => void;
}

export const LiveSessionRoom = ({
    sessionId,
    token,
    roomName,
    serverUrl,
    onDisconnect,
    title,
    isTeacher,
    studentName,
    isGuest = false,
    guestAccessCode,
    initialSessionData,
    isTheaterMode,
    onToggleTheater,
}: LiveSessionRoomProps) => {
    const [showChat, setShowChat] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [showVirtualBg, setShowVirtualBg] = useState(false);
    const [room, setRoom] = useState<any>(null);
    const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
    const [sessionData, setSessionData] = useState<any>(initialSessionData ?? null);
    const [activePopQuiz, setActivePopQuiz] = useState<any>(null);
    const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
    // Audio gating: start with audio=false to avoid AudioContext before user gesture
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    // AI content panel
    const [aiContent, setAiContent] = useState<{ title: string; content: string; pop_quiz?: any; assignment?: any } | null>(null);
    const [showAiContent, setShowAiContent] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [floatingContent, setFloatingContent] = useState<any>(null);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
    const [timeWarningShown, setTimeWarningShown] = useState(false);
    const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
    const [endingSession, setEndingSession] = useState(false);
    const [endSessionForm, setEndSessionForm] = useState({
        covered_full_plan: false,
        actual_stop_segment: '',
        continuity_notes: '',
        remaining_coverage: '',
        next_class_priority: '',
        learner_difficulties: '',
    });

    const teacherLiveQuizResults = useMemo(() => {
        if (!isTeacher) return null;
        const quizSource = activePopQuiz?.questions || sessionData?.context?.active_pop_quiz?.questions || [];
        const questions = Array.isArray(quizSource) ? quizSource : [];
        const liveQuizMap = sessionData?.quiz_results?.live_quizzes || {};
        const studentPresence = sessionData?.student_presence || {};
        const submissions = Object.entries(liveQuizMap).map(([studentId, result]: [string, any]) => {
            const presence = studentPresence?.[studentId] || {};
            const studentName = presence?.name || presence?.student_name || presence?.studentName || 'Student';
            const details = Array.isArray(result?.details) ? result.details : [];
            return {
                studentId,
                studentName,
                score: typeof result?.score === 'number' ? result.score : 0,
                correct: typeof result?.correct === 'number' ? result.correct : 0,
                total: typeof result?.total === 'number' ? result.total : questions.length,
                submittedAt: result?.submitted_at || null,
                details,
            };
        });

        const questionBreakdown = questions.map((question: any, idx: number) => {
            const responses = submissions.map((submission) => {
                const detail = submission.details[idx] || {};
                return {
                    studentId: submission.studentId,
                    studentName: submission.studentName,
                    selectedIndex: detail.student_answer,
                    selectedChoice: letterFromIndex(detail.student_answer),
                    correctIndex: detail.correct_answer,
                    correctChoice: letterFromIndex(detail.correct_answer),
                    isCorrect: Boolean(detail.is_correct),
                };
            });

            return {
                questionNumber: idx + 1,
                question: question?.text || question?.question || `Question ${idx + 1}`,
                options: Array.isArray(question?.options) ? question.options : [],
                correctIndex: question?.correct_index,
                correctChoice: letterFromIndex(question?.correct_index),
                responses,
            };
        });

        return {
            title: activePopQuiz?.title || sessionData?.context?.active_pop_quiz?.title || 'Live Pop Quiz',
            totalQuestions: questions.length,
            submissions,
            questionBreakdown,
        };
    }, [isTeacher, activePopQuiz, sessionData]);

    // Component to capture room context and local video track
    const RoomCapturer = ({ onRoomReady }: { onRoomReady: (r: any) => void }) => {
        const r = useRoomContext();
        const { cameraTrack } = useLocalParticipant();

        useEffect(() => {
            if (r) onRoomReady(r);
        }, [r, onRoomReady]);

        // Capture video track when available
        useEffect(() => {
            if (cameraTrack?.track) {
                console.log('[RoomCapturer] Captured camera track:', cameraTrack.track.sid);
                setLocalVideoTrack(cameraTrack.track as LocalVideoTrack);
            }
        }, [cameraTrack]);

        return null;
    };

    // Poll session data. Teachers need live metrics; students need shared
    // materials and the planned class duration.
    useEffect(() => {
        if (isGuest) {
            return;
        }

        const fetchSession = async () => {
            try {
                const data = await sessionAPI.get(sessionId, { lite: !isTeacher });
                setSessionData(data.session || data);
            } catch (error) {
                console.error('Failed to fetch live session data:', error);
            }
        };

        fetchSession();
        const interval = setInterval(fetchSession, isTeacher ? 5000 : 30000);
        return () => clearInterval(interval);
    }, [sessionId, isTeacher, isGuest]);

    useEffect(() => {
        if (!sessionData) return;

        const plannedMinutes = Number(sessionData.duration_minutes || 0);
        const scheduledAt = parseSessionTimestamp(sessionData.scheduled_start);
        const actualStartAt = parseSessionTimestamp(sessionData.actual_start);
        const startAt = actualStartAt ?? scheduledAt;
        if (!Number.isFinite(plannedMinutes) || plannedMinutes <= 0 || !startAt) {
            setRemainingSeconds(null);
            return;
        }

        const plannedSeconds = plannedMinutes * 60;

        const updateRemaining = () => {
            const elapsed = Math.max(0, Math.floor((Date.now() - startAt) / 1000));
            const remaining = Math.max(0, plannedSeconds - elapsed);
            setRemainingSeconds(remaining);

            if (isTeacher && !timeWarningShown && elapsed >= plannedSeconds * 0.9) {
                const minutesLeft = Math.max(1, Math.ceil(remaining / 60));
                toast.warning(`About ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left in this planned session. Start wrapping up or note where to continue next class.`);
                setTimeWarningShown(true);
            }
        };

        updateRemaining();
        const timer = setInterval(updateRemaining, 1000);
        return () => clearInterval(timer);
    }, [sessionData?.actual_start, sessionData?.scheduled_start, sessionData?.duration_minutes, isTeacher, timeWarningShown]);

    const buildSavedPrepContent = async () => {
        const shared = await sessionAPI.getSharedContent(sessionId).catch(() => null);
        const latestSession = sessionData || (await sessionAPI.get(sessionId).then((data: any) => data.session || data));
        const material = latestSession?.context?.lesson_materials || {};
        const sessionPlan = latestSession?.context?.session_plan || shared?.session_plan || {};
        const outline = toList(latestSession?.session_outline || material.outline);
        const assignment = latestSession?.take_home_assignment || shared?.assignment || material.assignment;
        const quiz = latestSession?.pre_session_quiz?.questions || material.pop_quiz || [];
        const tips = toList(latestSession?.context?.teacher_tips || material.teacher_tips);
        const note = latestSession?.class_notes || shared?.notes || material.class_note;
        const topic = latestSession?.context?.topic || shared?.topic || title || 'Lesson';
        const plannedSegments = Array.isArray(sessionPlan?.planned_segments) ? sessionPlan.planned_segments : [];
        const continuity = sessionPlan?.continuity_from_previous;

        if (!outline.length && !note?.content && !assignment && !quiz.length) {
            return null;
        }

        const parts = [
            `# ${topic}`,
            sessionPlan?.session_goal ? `## Session goal\n${sessionPlan.session_goal}` : '',
            continuity?.previous_teacher_note ? `## Previous class note\n${continuity.previous_teacher_note}` : '',
            outline.length ? `## Lesson outline\n${outline.map((point) => `- ${point}`).join('\n')}` : '',
            plannedSegments.length ? `## Planned coverage for this class\n${plannedSegments.map((item: any) => `- ${smartPrepText(item.title)}`).join('\n')}` : '',
            note?.content ? `## Class note\n${note.content}` : '',
            quiz.length ? `## Pre-session checks\n${quiz.length} question${quiz.length === 1 ? '' : 's'} already prepared for this class.` : '',
            assignment ? `## Take-home assignment\n${assignmentMarkdown(assignment)}` : '',
            tips.length ? `## Teacher tips\n${tips.map((tip) => `- ${tip}`).join('\n')}` : '',
        ].filter(Boolean);

        return {
            title: `Prep material: ${topic}`,
            content: parts.join('\n\n'),
            pop_quiz: quiz,
            assignment,
        };
    };

    const buildSavedNotesContent = async () => {
        const shared = await sessionAPI.getSharedContent(sessionId).catch(() => null);
        const latestSession = sessionData || (await sessionAPI.get(sessionId).then((data: any) => data.session || data));
        const material = latestSession?.context?.lesson_materials || {};
        const sessionPlan = latestSession?.context?.session_plan || shared?.session_plan || {};
        const notes = latestSession?.class_notes || shared?.notes || material.class_note;
        const assignment = latestSession?.take_home_assignment || shared?.assignment || material.assignment;
        const topic = latestSession?.context?.topic || shared?.topic || title || 'Class notes';
        const content = typeof notes === 'string' ? notes : notes?.content;

        if (!content && !assignment) return null;

        return {
            title: notes?.title || `Class notes: ${topic}`,
            content: [
                sessionPlan?.session_goal ? `## Session goal\n${sessionPlan.session_goal}` : '',
                content || '',
                sessionPlan?.teacher_stop_note ? `## Where we stopped\n${sessionPlan.teacher_stop_note}` : '',
                sessionPlan?.next_recommended_segment ? `## Next class begins with\n${sessionPlan.next_recommended_segment}` : '',
                assignment ? `## Take-home assignment\n${assignmentMarkdown(assignment)}` : '',
            ].filter(Boolean).join('\n\n'),
            assignment,
        };
    };

    useEffect(() => {
        const sessionPlan = sessionData?.context?.session_plan;
        if (!sessionPlan) return;
        setEndSessionForm((prev) => ({
            ...prev,
            actual_stop_segment: prev.actual_stop_segment || sessionPlan.recommended_end_segment || '',
            continuity_notes: prev.continuity_notes || sessionPlan.teacher_stop_note || '',
            next_class_priority: prev.next_class_priority || sessionPlan.next_recommended_segment || '',
        }));
    }, [sessionData?.context?.session_plan]);

    const handleEndSession = async () => {
        setEndingSession(true);
        try {
            await sessionAPI.end(sessionId, {
                covered_full_plan: endSessionForm.covered_full_plan,
                actual_stop_segment: endSessionForm.actual_stop_segment || undefined,
                continuity_notes: endSessionForm.continuity_notes.trim() || undefined,
                remaining_coverage: endSessionForm.remaining_coverage.trim() || undefined,
                next_class_priority: endSessionForm.next_class_priority.trim() || undefined,
                learner_difficulties: endSessionForm.learner_difficulties
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
            });
            setShowEndSessionDialog(false);
            onDisconnect();
        } catch (error) {
            console.error("Failed to end session:", error);
            toast.error("Failed to end session properly");
            onDisconnect();
        } finally {
            setEndingSession(false);
        }
    };

    const canEndSession =
        endSessionForm.covered_full_plan ||
        Boolean(
            endSessionForm.continuity_notes.trim() ||
            endSessionForm.remaining_coverage.trim() ||
            endSessionForm.next_class_priority.trim()
        );
    const competencyUpdates = Object.values((sessionData?.context?.competency_updates || {}) as Record<string, SessionCompetencyUpdate>);

    const handleSmartPrep = async () => {
        try {
            setAiLoading(true);
            const savedPrep = await buildSavedPrepContent();
            if (savedPrep) {
                setAiContent(savedPrep);
                setShowAiContent(true);
                toast.success("Saved prep material loaded.", { style: { color: '#fff', background: '#059669', fontWeight: '600' } });
            } else {
                toast.error("No saved prep material is available for this session yet.");
            }
            return;
            toast('AI Helper is preparing your lesson materials...', { icon: '\uD83E\uDD16', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            
            const studentId =
                (sessionData?.student_presence ? Object.keys(sessionData.student_presence)[0] : null) ||
                sessionData?.context?.enrolled_students?.[0] ||
                sessionData?.students?.[0]?.id ||
                sessionData?.enrolled_students?.[0]?.id;
            if (!studentId) {
                toast.error("No students are assigned or connected yet.");
                return;
            }

            const response = await sessionAPI.prepareSmartLesson(studentId, sessionData.subject_id, sessionData.topic_id || sessionData.context?.topic_id);
            if (response.success && response.materials) {
                const materials = response.materials;
                const outline = Array.isArray(materials.outline)
                    ? materials.outline.map(smartPrepText).filter(Boolean)
                    : smartPrepText(materials.outline).split(";").map((item) => item.trim()).filter(Boolean);
                const assignment = smartPrepText(materials.assignment) || "Review the lesson and prepare one question for the next class.";
                const contentData = {
                    title: `\uD83E\uDD16 Smart Prep: ${response.topic}`,
                    content: `# ${response.topic}\n\n## Lesson outline\n${outline.map((p: string) => `- ${p}`).join('\n')}\n\n## Take-home assignment\n${assignment}\n\n## Student instructions\n- Review the lesson outline before the next class.\n- Complete the take-home task and be ready to explain your working.`,
                    pop_quiz: materials.pop_quiz,
                    assignment
                };
                setAiContent(contentData);
                setShowAiContent(true);
                toast.success("Lesson materials ready! Review in the AI panel.", { style: { color: '#fff', background: '#059669', fontWeight: '600' } });
            }
        } catch (error) {
            console.error("Smart Prep Error:", error);
            toast.error("Could not generate smart prep materials.");
        } finally {
            setAiLoading(false);
        }
    };

    const handleGenerateNotes = async () => {
        try {
            setAiLoading(true);
            const savedNotes = await buildSavedNotesContent();
            if (savedNotes) {
                setAiContent(savedNotes);
                setShowAiContent(true);
                toast.success("Saved class note loaded. Review before sending.", { style: { color: '#fff', background: '#059669', fontWeight: '600' } });
            } else {
                toast.error("No saved class note is available for this session yet.");
            }
            return;
            toast('Generating session notes...', { icon: '\uD83D\uDCDD', style: { color: '#fff', background: 'hsl(var(--accent))', fontWeight: '600' } });
            const response = await aiAPI.generateNotes(sessionId);
            if (response.success) {
                const notesData = {
                    title: `\uD83D\uDCDD Session Notes: ${title}`,
                    content: response.notes || "Notes generated successfully."
                };
                setAiContent(notesData);
                setShowAiContent(true);

                // NO LONGER BROADCASTING AUTOMATICALLY
                // Teacher must review and click 'Send to Students'
                
                toast.success("Notes generated! Review before sending.", { style: { color: '#fff', background: '#059669', fontWeight: '600' } });
            } else {
                toast.error("Failed to generate notes.");
            }
        } catch (error) {
            console.error("AI Notes Error:", error);
            toast.error("Could not generate notes.");
        } finally {
            setAiLoading(false);
        }
    };

    const handleStudentOpenNotes = async () => {
        if (aiContent) {
            setShowAiContent(true);
            return;
        }

        if (isGuest) {
            toast.info('Notes will appear here when the teacher shares them during the live class.');
            return;
        }

        try {
            const savedNotes = await buildSavedNotesContent();
            if (savedNotes) {
                setAiContent(savedNotes);
                setShowAiContent(true);
                return;
            }
            const shared = await sessionAPI.getSharedContent(sessionId);
            const notes = shared?.notes;
            const content =
                typeof notes === 'string'
                    ? notes
                    : notes?.content || 'No shared note is available yet.';
            setAiContent({
                title: notes?.title || shared?.topic || 'Class notes',
                content,
                assignment: shared?.assignment?.instructions || shared?.assignment,
            });
            setShowAiContent(true);
        } catch (error) {
            toast.error('No class note has been shared yet.');
        }
    };

    return (
        <div className={`relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background text-foreground transition-all duration-300 ${isTheaterMode ? 'rounded-none border-0' : 'rounded-lg border border-border shadow-none'}`}>
            {/* Session Header */}
            <div className="z-20 border-b border-border bg-background px-2.5 py-2 sm:px-4">
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                        <Video className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 max-w-[42vw] sm:max-w-none">
                        <h2 className="flex items-center gap-2 truncate text-sm font-semibold sm:text-lg">
                            <span className="truncate">{title}</span>
                            <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary">
                                Live
                            </Badge>
                            {remainingSeconds !== null && (
                                <Badge variant="outline" className={`shrink-0 gap-1 ${remainingSeconds <= 300 ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-border bg-subtle text-muted-foreground'}`}>
                                    <Clock className="h-3 w-3" />
                                    {formatCountdown(remainingSeconds)}
                                </Badge>
                            )}
                        </h2>
                        <p className="hidden truncate text-xs text-muted-foreground sm:block">Live teaching workspace - Room: {roomName}</p>
                    </div>
                </div>
                <div className="shrink-0 flex max-w-[52vw] items-center gap-1 overflow-x-auto sm:max-w-none sm:gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleTheater}
                        className="rounded-lg gap-2 px-2 text-muted-foreground hover:bg-secondary hover:text-foreground sm:px-3"
                        title={isTheaterMode ? "Exit Theater Mode" : "Theater Mode"}
                    >
                        {isTheaterMode ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isTheaterMode ? 'Exit' : 'Wide'}</span>
                    </Button>
                    {isTeacher ? (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowMetrics(!showMetrics)}
                                className={`rounded-lg gap-2 px-2 sm:px-3 ${showMetrics ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                            >
                                <BarChart3 className="w-4 h-4" />
                                <span className="hidden sm:inline">{showMetrics ? 'Hide Signals' : 'Signals'}</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSmartPrep}
                                disabled={aiLoading}
                                className="rounded-lg gap-2 border border-primary/20 bg-primary/5 px-2 font-semibold text-primary hover:bg-primary/10 sm:px-3"
                                title="Use AI to prepare outline, quiz, and assignment"
                            >
                                <Sparkles className="w-4 h-4" />
                                <span className="hidden sm:inline">{aiLoading ? 'Preparing...' : 'Smart Assistant'}</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleGenerateNotes}
                                disabled={aiLoading}
                                className="rounded-lg gap-2 px-2 text-muted-foreground hover:bg-secondary hover:text-foreground sm:px-3"
                            >
                                <FileText className="w-4 h-4" />
                                <span className="hidden sm:inline">{aiLoading ? '...' : 'Notes'}</span>
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleStudentOpenNotes}
                            className="rounded-lg gap-2 px-2 text-muted-foreground hover:bg-secondary hover:text-foreground sm:px-3"
                        >
                            <BookOpen className="w-4 h-4" />
                            <span className="hidden sm:inline">{aiContent ? 'View Notes' : 'Notes'}</span>
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChat(!showChat)}
                        className={`rounded-lg gap-2 px-2 sm:px-3 ${showChat ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span className="hidden sm:inline">Chat</span>
                    </Button>
                    <Button
                        variant={showVirtualBg ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setShowVirtualBg(true)}
                        className={`rounded-lg gap-2 px-2 sm:px-3 ${showVirtualBg ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <Camera className="w-4 h-4" />
                        <span className="hidden sm:inline">Background</span>
                    </Button>
                    {isTeacher ? (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onDisconnect}
                                className="rounded-lg gap-2 border-border px-2 text-foreground hover:bg-secondary sm:px-3"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:inline">Leave</span>
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowEndSessionDialog(true)}
                                className="rounded-lg gap-2 px-2 sm:px-3"
                            >
                                <X className="w-4 h-4" />
                                <span className="hidden sm:inline">End Session</span>
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={onDisconnect}
                            className="rounded-lg gap-2 px-2 sm:px-3"
                        >
                            <X className="w-4 h-4" />
                            <span className="hidden sm:inline">Leave</span>
                        </Button>
                    )}
                    {isTeacher && (
                        <Button
                            variant={showWhiteboard ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setShowWhiteboard(!showWhiteboard)}
                            className={`rounded-lg gap-2 px-2 sm:px-3 ${showWhiteboard ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                        >
                            <PenTool className="w-4 h-4" />
                            <span className="hidden sm:inline">Whiteboard</span>
                        </Button>
                    )}
                </div>
            </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground sm:border-t-0 sm:pt-0">
                    <Badge variant="outline" className="border-border bg-subtle text-muted-foreground">
                        {isTeacher ? 'Teacher-led room' : 'Learner session'}
                    </Badge>
                    <span className="hidden sm:inline">Keep the class moving through one clear teaching step at a time.</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 overflow-hidden bg-subtle">
                {/* Video Area */}
                <div className={`relative min-h-0 min-w-0 overflow-hidden bg-black ${showWhiteboard ? 'hidden md:block md:w-1/2' : 'flex-1'}`}>
                    <VideoErrorBoundary>
                        <LiveKitRoom
                            video={true}
                            audio={isAudioEnabled}   /* Audio only enabled after user gesture to avoid AudioContext error */
                            token={token}
                            serverUrl={serverUrl}
                            onDisconnected={onDisconnect}
                            data-lk-theme="default"
                            style={{ height: '100%' }}
                            onError={(error) => {
                                // Suppress AudioContext and mic timeout errors silently
                                if (
                                    error.message?.includes('AudioContext') ||
                                    error.message?.includes('pending publication') ||
                                    error.message?.includes('microphone')
                                ) {
                                    console.warn('[LiveKit] Audio/mic error suppressed:', error.message);
                                    return;
                                }
                                console.error('[LiveKit] Room error:', error);
                            }}
                        >
                            <RoomCapturer onRoomReady={setRoom} />
                            <SessionContent
                                isTeacher={isTeacher}
                                isGuest={isGuest}
                                guestAccessCode={guestAccessCode}
                                guestName={studentName}
                                sessionId={sessionId}
                                sessionData={sessionData}
                                activePopQuiz={activePopQuiz}
                                setActivePopQuiz={setActivePopQuiz}
                                reactions={reactions}
                                setReactions={setReactions}
                                title={title}
                                setAiContent={setAiContent}
                                setShowAiContent={setShowAiContent}
                                floatingContent={floatingContent}
                                setFloatingContent={setFloatingContent}
                                localVideoTrack={localVideoTrack}
                                showVirtualBg={showVirtualBg}
                                setShowVirtualBg={setShowVirtualBg}
                            />
                            <RoomAudioRenderer />
                            {/* Audio gate overlay - shown until user clicks 'Join with Audio' */}
                            {!isAudioEnabled && (
                                <div className="absolute inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-500 sm:p-8">
                                    <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center mb-5 border border-teal-500/30 animate-pulse sm:w-20 sm:h-20 sm:mb-6">
                                        <Volume2 className="w-8 h-8 text-teal-400 sm:w-10 sm:h-10" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-2 sm:text-2xl">Enable Audio to Join</h3>
                                    <p className="text-slate-400 max-w-md mb-2">Your browser requires a click to enable audio.</p>
                                    <p className="text-slate-500 text-sm max-w-md mb-6 sm:mb-8">
                                        If you see a mic timeout warning in the console, it will clear once audio is enabled here.
                                    </p>
                                    <Button
                                        size="lg"
                                        className="rounded-xl px-6 py-5 text-base font-bold bg-teal-600 hover:bg-teal-500 shadow-xl shadow-teal-500/20 group transition-all sm:rounded-2xl sm:px-12 sm:py-7 sm:text-lg"
                                        onClick={() => setIsAudioEnabled(true)}
                                    >
                                        <Mic className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                                        Join with Audio
                                    </Button>
                                </div>
                            )}
                        </LiveKitRoom>
                    </VideoErrorBoundary>
                </div>

                {/* Whiteboard Area */}
                <div className={`border-l border-border transition-all duration-300 ${showWhiteboard ? 'w-full md:w-1/2 opacity-100' : 'w-0 opacity-0 overflow-hidden pointer-events-none'}`}>
                    <Whiteboard room={room} isTeacher={isTeacher} visible={showWhiteboard} />
                </div>

                {/* AI Explanations / Notes Panel */}
                {showAiContent && aiContent && (
                    <div className="absolute inset-y-0 right-0 z-[60] flex w-full min-w-0 min-h-0 flex-col overflow-hidden border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-300 sm:w-96">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-subtle p-3 sm:p-4">
                            <div className="flex min-w-0 items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{aiContent.title}</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowAiContent(false)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
                            <div className="min-w-0 max-w-full break-words p-3 [overflow-wrap:anywhere] prose prose-sm prose-p:max-w-full sm:p-5" dangerouslySetInnerHTML={{ __html: (() => {
                                // Lightweight markdown-to-HTML for AI content
                                const md = aiContent.content || '';
                                return md
                                    .split('\n')
                                    .map((line: string) => {
                                        const trimmed = line.trim();
                                        if (!trimmed) return '<div class="h-2"></div>';
                                        // Headings
                                        if (trimmed.startsWith('### ')) return `<h4 class="mt-4 mb-2 text-[15px] font-semibold tracking-tight text-foreground">${trimmed.slice(4).replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')}</h4>`;
                                        if (trimmed.startsWith('## ')) return `<h3 class="mt-5 mb-2 text-base font-bold tracking-tight text-foreground">${trimmed.slice(3).replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')}</h3>`;
                                        if (trimmed.startsWith('# ')) return `<h2 class="mt-5 mb-3 text-lg font-bold tracking-tight text-foreground">${trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')}</h2>`;
                                        // Bullets
                                        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) return `<div class="mb-2 flex gap-3 rounded-lg border border-border/70 bg-subtle/40 px-3 py-2"><span class="mt-0.5 text-sm font-bold text-primary">&bull;</span><span class="text-[15px] leading-7 text-foreground">${trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')}</span></div>`;
                                        // Numbered lists
                                        if (/^\d+\.\s/.test(trimmed)) return `<div class="mb-2 flex gap-3 rounded-lg border border-border/70 bg-subtle/40 px-3 py-2"><span class="text-sm font-bold text-primary">${trimmed.match(/^\d+/)?.[0]}.</span><span class="text-[15px] leading-7 text-foreground">${trimmed.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')}</span></div>`;
                                        // Regular paragraph with bold
                                        return `<p class="mb-2 text-[15px] leading-7 text-foreground/95">${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')}</p>`;
                                    })
                                    .join('');
                            })() }} />
                        </ScrollArea>
                        <div className="space-y-3 border-t border-border p-4">
                            {isTeacher && (
                                <Button 
                                    className="w-full gap-2 rounded-xl bg-primary py-5 font-semibold text-primary-foreground transition-all active:scale-95 hover:bg-primary/90"
                                    onClick={async () => {
                                        if (room && aiContent) {
                                            const encoder = new TextEncoder();
                                            // Handle both regular notes and pop quizzes from smart assistant
                                            if (aiContent.pop_quiz) {
                                                const normalizedQuiz = normalizeQuizQuestions(aiContent.pop_quiz);
                                                if (!normalizedQuiz.length) {
                                                    toast.error("No valid saved quiz is available to send.");
                                                    return;
                                                }
                                                const quizPayload = {
                                                    title: `Quick Quiz: ${title || aiContent.title || 'Live Session'}`,
                                                    questions: normalizedQuiz
                                                };
                                                try {
                                                    await sessionAPI.pushContent(sessionId, {
                                                        content_type: 'pop_quiz',
                                                        content: quizPayload
                                                    });
                                                    await sessionAPI.pushContent(sessionId, {
                                                        content_type: 'notes',
                                                        content: aiContent
                                                    });
                                                } catch (e) {
                                                    console.warn("Failed to push to inbox:", e);
                                                    toast.error("Could not save this content to student inboxes.");
                                                    return;
                                                }

                                                const quizData = encoder.encode(JSON.stringify({ 
                                                    type: 'POP_QUIZ', 
                                                    quiz: quizPayload
                                                }));
                                                room.localParticipant.publishData(quizData, { reliable: true });

                                                const notesData = encoder.encode(JSON.stringify({ type: 'AI_CONTENT', data: aiContent }));
                                                room.localParticipant.publishData(notesData, { reliable: true });

                                                toast.success("Quiz and Notes pushed to students!");
                                            } else {
                                                try {
                                                    await sessionAPI.pushContent(sessionId, {
                                                        content_type: 'notes',
                                                        content: aiContent
                                                    });
                                                } catch (e) {
                                                    console.warn("Failed to push notes to inbox:", e);
                                                    toast.error("Could not save this note to student inboxes.");
                                                    return;
                                                }
                                                const data = encoder.encode(JSON.stringify({ type: 'AI_CONTENT', data: aiContent }));
                                                room.localParticipant.publishData(data, { reliable: true });
                                                toast.success("Content shared with all students!");
                                            }
                                        }
                                    }}
                                >
                                    <Zap className="w-4 h-4" />
                                    SEND TO STUDENTS
                                </Button>
                            )}
                            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">Generated by EduNexus AI • {new Date().toLocaleTimeString()}</p>
                        </div>
                    </div>
                )}

                {/* Metrics Sidebar (Teacher Only) */}
                {isTeacher && showMetrics && (
                    <div className="absolute inset-y-0 right-0 z-10 flex w-full min-w-0 flex-col border-l border-border bg-background/98 backdrop-blur-md animate-in slide-in-from-right duration-300 sm:relative sm:w-[26rem]">
                        <div className="flex items-center justify-between border-b border-border bg-subtle p-4">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                <h3 className="text-sm font-semibold text-foreground">Live class signals</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowMetrics(false)} className="h-8 w-8 text-muted-foreground">
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                        <ScrollArea className="flex-1 p-4">
                            {sessionData ? (
                                <div className="space-y-4">
                                    <SessionMetrics
                                        engagementTimeline={sessionData.engagement_timeline || []}
                                        studentPresence={sessionData.student_presence || {}}
                                        quizResults={teacherLiveQuizResults}
                                    />
                                    {competencyUpdates.length > 0 && (
                                        <div className="rounded-lg border border-border bg-subtle p-3">
                                            <div className="mb-3 flex items-center gap-2">
                                                <Activity className="h-4 w-4 text-primary" />
                                                <h4 className="text-sm font-semibold text-foreground">Learner competency shifts</h4>
                                            </div>
                                            <div className="space-y-3">
                                                {competencyUpdates.map((update) => (
                                                    <div key={update.student_id} className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-semibold text-foreground">{update.student_name}</p>
                                                            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                                                                {update.readiness || 'Building'}
                                                            </Badge>
                                                            {typeof update.last_score_pct === 'number' && (
                                                                <Badge variant="outline" className="border-border text-foreground">
                                                                    {Math.round(update.last_score_pct)}%
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="mt-2">
                                                            <span className="font-medium text-foreground">Domain:</span> {update.domain_name}
                                                        </p>
                                                        {Array.isArray(update.gap_signals) && update.gap_signals.length > 0 && (
                                                            <p className="mt-1">
                                                                <span className="font-medium text-foreground">Needs support:</span> {update.gap_signals.join('; ')}
                                                            </p>
                                                        )}
                                                        {Array.isArray(update.next_focus) && update.next_focus.length > 0 && (
                                                            <p className="mt-1">
                                                                <span className="font-medium text-foreground">Next focus:</span> {update.next_focus.join('; ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center italic text-muted-foreground">
                                    Loading live metrics...
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                )}

                {/* Sidebar Chat */}
                {showChat && (
                    <div className="absolute inset-y-0 right-0 z-10 flex w-full min-w-0 flex-col border-l border-border bg-background animate-in slide-in-from-right duration-300 sm:relative sm:w-80">
                        <div className="flex items-center justify-between border-b border-border bg-subtle p-4">
                            <h3 className="text-sm font-semibold text-foreground">Session Chat</h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowChat(false)} className="h-8 w-8 text-muted-foreground">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="flex flex-1 items-center justify-center p-4 text-sm italic text-muted-foreground">
                            Real-time chat is being established...
                        </div>
                    </div>
                )}
            </div>

            {/* AI Floating Status - docked at bottom edge */}
            {!showMetrics && null}

            <Dialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>End session and save continuity</DialogTitle>
                        <DialogDescription>
                            Capture where this class really stopped so the next session starts from the right place.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    checked={endSessionForm.covered_full_plan}
                                    onCheckedChange={(checked) => setEndSessionForm((prev) => ({
                                        ...prev,
                                        covered_full_plan: Boolean(checked),
                                    }))}
                                    className="mt-1"
                                />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">
                                        I covered the full planned session.
                                    </p>
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        Leave this checked only if you reached the planned stopping point for today. Otherwise, record where the class stopped before ending the session.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Actual stopping point</Label>
                            <Select
                                value={endSessionForm.actual_stop_segment || "__unset__"}
                                onValueChange={(value) => setEndSessionForm((prev) => ({
                                    ...prev,
                                    actual_stop_segment: value === "__unset__" ? "" : value,
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose the segment you reached" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__unset__">Use the planned stopping point</SelectItem>
                                    {Array.isArray(sessionData?.context?.session_plan?.planned_segments) && sessionData.context.session_plan.planned_segments.map((segment: any) => (
                                        <SelectItem key={segment.segment_id} value={segment.segment_id}>
                                            {smartPrepText(segment.title)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Teacher continuity note</Label>
                            <Textarea
                                value={endSessionForm.continuity_notes}
                                onChange={(event) => setEndSessionForm((prev) => ({ ...prev, continuity_notes: event.target.value }))}
                                placeholder="For example: Covered the meaning of modular arithmetic and two worked examples. Resume next class from guided practice on congruence notation."
                                rows={4}
                            />
                            {!endSessionForm.covered_full_plan && (
                                <p className="text-xs leading-5 text-muted-foreground">
                                    If you did not finish the planned session, record what was covered and what the next teacher move should be.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Still remaining from the planned session</Label>
                            <Input
                                value={endSessionForm.remaining_coverage}
                                onChange={(event) => setEndSessionForm((prev) => ({ ...prev, remaining_coverage: event.target.value }))}
                                placeholder="For example: Classwork comparison questions and the short wrap-up quiz."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Next class priority</Label>
                            <Input
                                value={endSessionForm.next_class_priority}
                                onChange={(event) => setEndSessionForm((prev) => ({ ...prev, next_class_priority: event.target.value }))}
                                placeholder="For example: Start with guided practice before introducing the harder examples."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Learner difficulties (one per line)</Label>
                            <Textarea
                                value={endSessionForm.learner_difficulties}
                                onChange={(event) => setEndSessionForm((prev) => ({ ...prev, learner_difficulties: event.target.value }))}
                                placeholder={"Confuses the remainder with the quotient\nNeeds slower pacing on worked examples"}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEndSessionDialog(false)} disabled={endingSession}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleEndSession} disabled={endingSession || !canEndSession}>
                            {endingSession ? 'Saving...' : 'End Session'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
};

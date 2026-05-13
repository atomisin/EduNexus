const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
import { useState, useEffect, Component, type ReactNode } from 'react';
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
import { Video, MessageSquare, X, Sparkles, BarChart3, ChevronRight, FileText, PenTool, Camera, LogOut, Volume2, Mic, BookOpen, Maximize2, Zap, Activity, BarChart2, Users, Clock } from 'lucide-react';
import { SessionMetrics } from './SessionMetrics';
import { Whiteboard } from './Whiteboard';
import { VirtualBackgroundControl } from './VirtualBackgroundControl';
import { sessionAPI, engagementAPI, aiAPI } from '@/services/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { FloatingContentModal } from './FloatingContentModal';
import AcademicMarkdown from '@/components/AcademicMarkdown';

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
    sessionId,
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
                toast(`New Pop Quiz: ${data.quiz.title}`, { icon: '📝', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            } else if (data.type === 'AI_CONTENT') {
                setFloatingContent({
                    type: 'notes',
                    content: data.data
                });
                setAiContent(data.data);
                window.setTimeout(() => window.dispatchEvent(new Event('edunexus:notifications-refresh')), 1500);
                toast(`Teacher shared new lesson material!`, { icon: '📚', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            }
        };

        room.on(RoomEvent.DataReceived, handleData);

        // Student Monitoring: Periodic video frame capture
        let monitoringInterval: ReturnType<typeof setInterval>;
        if (!isTeacher) {
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
        try {
            await engagementAPI.recordParticipation(sessionId, 'reaction');
        } catch (error) {
            console.error('Failed to record reaction participation:', error);
        }
    };

    const triggerPopQuiz = async () => {
        if (!room) return;
        try {
            toast.info("Loading the saved lesson quiz...");
            const [latestSessionResponse, shared] = await Promise.all([
                sessionAPI.get(sessionId).catch(() => null),
                sessionAPI.getSharedContent(sessionId).catch(() => null),
            ]);
            const latestSession = latestSessionResponse?.session || latestSessionResponse;
            const materials = latestSession?.context?.lesson_materials || {};
            const quizCandidates = [
                latestSession?.context?.active_pop_quiz,
                materials.pop_quiz,
                latestSession?.pre_session_quiz,
                shared?.pop_quiz,
            ];

            let questions: any[] = [];
            const currentTopic = latestSession?.context?.topic || shared?.topic || title || 'Quick Check';
            let quizTitle = `In-class quiz: ${currentTopic}`;
            for (const candidate of quizCandidates) {
                const normalized = normalizeQuizQuestions(candidate);
                if (normalized.length) {
                    questions = normalized;
                    const candidateTitle = smartPrepText(candidate?.title);
                    if (candidateTitle && !/pre[-\s]?session/i.test(candidateTitle)) {
                        quizTitle = candidateTitle;
                    }
                    break;
                }
            }

            if (!questions.length) {
                toast.error("No saved pop quiz is available for this session yet.");
                return;
            }

            const quizPayload = { title: quizTitle, questions };
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
            toast.success("Pop Quiz triggered for all students!", { style: { color: '#fff', background: '#0d9488', fontWeight: '600' } });
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
            <div className="absolute bottom-24 sm:bottom-36 left-1/2 -translate-x-1/2 flex w-[calc(100%-1rem)] max-w-xl items-center justify-center gap-2 overflow-x-auto bg-slate-900/85 backdrop-blur-md p-2 rounded-lg border border-slate-700/50 shadow-2xl z-40 sm:w-auto">
                {!isTeacher && (
                    <div className="flex min-w-0 items-center gap-1 pr-2 border-r border-slate-700 overflow-x-auto">
                        {['👍', '❤️', '👏', '😮', '🤔', '🔥'].map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => sendReaction(emoji)}
                                className="h-8 px-2 flex items-center justify-center hover:bg-slate-800 rounded-md transition-colors text-xs font-semibold text-slate-100"
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
                        className="shrink-0 rounded-lg gap-2 text-teal-300 hover:bg-teal-500/10"
                    >
                        <Sparkles className="w-4 h-4" />
                        Trigger Pop Quiz
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
                        const res = await sessionAPI.submitLiveQuiz(sessionId, answers);
                        
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
    isTheaterMode,
    onToggleTheater,
}: LiveSessionRoomProps) => {
    const [showChat, setShowChat] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [showVirtualBg, setShowVirtualBg] = useState(false);
    const [room, setRoom] = useState<any>(null);
    const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
    const [sessionData, setSessionData] = useState<any>(null);
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
        const fetchSession = async () => {
            try {
                const data = await sessionAPI.get(sessionId);
                setSessionData(data.session || data);
            } catch (error) {
                console.error('Failed to fetch live session data:', error);
            }
        };

        fetchSession();
        const interval = setInterval(fetchSession, isTeacher ? 5000 : 30000);
        return () => clearInterval(interval);
    }, [sessionId, isTeacher]);

    useEffect(() => {
        if (!sessionData) return;

        const plannedMinutes = Number(sessionData.duration_minutes || 0);
        const startValue = sessionData.actual_start || sessionData.scheduled_start;
        if (!plannedMinutes || !startValue) {
            setRemainingSeconds(null);
            return;
        }

        const startedAt = new Date(startValue).getTime();
        const plannedSeconds = plannedMinutes * 60;

        const updateRemaining = () => {
            const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
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
        const outline = toList(latestSession?.session_outline || material.outline);
        const assignment = latestSession?.take_home_assignment || shared?.assignment || material.assignment;
        const quiz = latestSession?.pre_session_quiz?.questions || material.pop_quiz || [];
        const tips = toList(latestSession?.context?.teacher_tips || material.teacher_tips);
        const note = latestSession?.class_notes || shared?.notes || material.class_note;
        const topic = latestSession?.context?.topic || shared?.topic || title || 'Lesson';

        if (!outline.length && !note?.content && !assignment && !quiz.length) {
            return null;
        }

        const parts = [
            `# ${topic}`,
            outline.length ? `## Lesson outline\n${outline.map((point) => `- ${point}`).join('\n')}` : '',
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
        const notes = latestSession?.class_notes || shared?.notes || material.class_note;
        const assignment = latestSession?.take_home_assignment || shared?.assignment || material.assignment;
        const topic = latestSession?.context?.topic || shared?.topic || title || 'Class notes';
        const content = typeof notes === 'string' ? notes : notes?.content;

        if (!content && !assignment) return null;

        return {
            title: notes?.title || `Class notes: ${topic}`,
            content: [
                content || '',
                assignment ? `## Take-home assignment\n${assignmentMarkdown(assignment)}` : '',
            ].filter(Boolean).join('\n\n'),
            assignment,
        };
    };

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
            toast('AI Helper is preparing your lesson materials...', { icon: '🤖', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            
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
                    title: `🤖 Smart Prep: ${response.topic}`,
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
            toast('Generating session notes...', { icon: '📝', style: { color: '#fff', background: 'hsl(var(--accent))', fontWeight: '600' } });
            const response = await aiAPI.generateNotes(sessionId);
            if (response.success) {
                const notesData = {
                    title: `📝 Session Notes: ${title}`,
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
        <div className={`flex min-w-0 max-w-full flex-col flex-1 min-h-0 bg-slate-950 text-white overflow-hidden transition-all duration-300 relative ${isTheaterMode ? 'rounded-none border-0' : 'rounded-lg border border-slate-800 shadow-2xl'}`}>
            {/* Session Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-2.5 py-2 sm:px-4 flex items-center justify-between gap-2 sm:gap-3 z-20">
                <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                    <div className="w-9 h-9 rounded-lg bg-teal-500/20 flex items-center justify-center border border-teal-500/30 shrink-0">
                        <Video className="w-5 h-5 text-teal-400" />
                    </div>
                    <div className="min-w-0 max-w-[42vw] sm:max-w-none">
                        <h2 className="text-sm sm:text-lg font-bold flex items-center gap-2 truncate">
                            <span className="truncate">{title}</span>
                            <Badge variant="secondary" className="shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                Live
                            </Badge>
                            {remainingSeconds !== null && (
                                <Badge variant="outline" className={`shrink-0 gap-1 border-slate-700 bg-slate-950/60 text-slate-200 ${remainingSeconds <= 300 ? 'border-amber-500/40 text-amber-300' : ''}`}>
                                    <Clock className="h-3 w-3" />
                                    {formatCountdown(remainingSeconds)}
                                </Badge>
                            )}
                        </h2>
                        <p className="hidden sm:block text-xs text-slate-400 truncate">Room: {roomName}</p>
                    </div>
                </div>
                <div className="shrink-0 flex max-w-[52vw] items-center gap-1 overflow-x-auto sm:max-w-none sm:gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleTheater}
                        className="rounded-lg gap-2 text-slate-400 hover:text-white px-2 sm:px-3"
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
                                onClick={handleSmartPrep}
                                disabled={aiLoading}
                                className="rounded-lg gap-2 text-teal-300 hover:bg-teal-500/10 font-bold px-2 sm:px-3"
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
                                className="rounded-lg gap-2 text-amber-400 hover:bg-amber-500/10 px-2 sm:px-3"
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
                            className="rounded-lg gap-2 text-amber-400 hover:bg-amber-500/10 px-2 sm:px-3"
                        >
                            <BookOpen className="w-4 h-4" />
                            <span className="hidden sm:inline">{aiContent ? 'View Notes' : 'Notes'}</span>
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChat(!showChat)}
                        className={`rounded-lg gap-2 px-2 sm:px-3 ${showChat ? 'bg-teal-500/20 text-teal-400' : 'text-slate-400'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span className="hidden sm:inline">Chat</span>
                    </Button>
                    <Button
                        variant={showVirtualBg ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setShowVirtualBg(true)}
                        className={`rounded-lg gap-2 px-2 sm:px-3 ${showVirtualBg ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'}`}
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
                                className="rounded-lg gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 px-2 sm:px-3"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:inline">Leave</span>
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                    if (!window.confirm("End this session for everyone? EduNexus will save the class history and continuity point.")) {
                                        return;
                                    }

                                    const continuityNotes = window.prompt(
                                        "Where did this class stop? Add a short note for the next class, for example: Covered examples 1-3; start next class from guided practice on modular inverse."
                                    );

                                    if (continuityNotes === null) {
                                        return;
                                    }

                                    try {
                                        await sessionAPI.end(sessionId, continuityNotes.trim());
                                        onDisconnect();
                                    } catch (error) {
                                        console.error("Failed to end session:", error);
                                        toast.error("Failed to end session properly");
                                        onDisconnect();
                                    }
                                }}
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
                            className={`rounded-lg gap-2 px-2 sm:px-3 ${showWhiteboard ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'}`}
                        >
                            <PenTool className="w-4 h-4" />
                            <span className="hidden sm:inline">Whiteboard</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex min-w-0 max-w-full min-h-0 overflow-hidden relative">
                {/* Video Area */}
                <div className={`relative min-w-0 bg-black min-h-0 ${showWhiteboard ? 'hidden md:block md:w-1/2' : 'flex-1'}`}>
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
                                sessionId={sessionId}
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
                            {/* Audio gate overlay — shown until user clicks 'Join with Audio' */}
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
                <div className={`border-l border-slate-800 transition-all duration-300 ${showWhiteboard ? 'w-full md:w-1/2 opacity-100' : 'w-0 opacity-0 overflow-hidden pointer-events-none'}`}>
                    <Whiteboard room={room} isTeacher={isTeacher} visible={showWhiteboard} />
                </div>

                {/* AI Explanations / Notes Panel */}
                {showAiContent && aiContent && (
                    <div className="absolute inset-y-0 right-0 w-full min-w-0 min-h-0 sm:w-96 bg-slate-900 border-l border-slate-700 flex flex-col z-[60] animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden">
                        <div className="p-3 sm:p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800 gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                <h3 className="min-w-0 truncate font-semibold text-sm text-white">{aiContent.title}</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowAiContent(false)} className="h-8 w-8 text-slate-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
                            <div className="min-w-0 max-w-full break-words p-3 [overflow-wrap:anywhere] prose prose-invert prose-sm prose-p:max-w-full sm:p-5" dangerouslySetInnerHTML={{ __html: (() => {
                                // Lightweight markdown-to-HTML for AI content
                                const md = aiContent.content || '';
                                return md
                                    .split('\n')
                                    .map((line: string) => {
                                        const trimmed = line.trim();
                                        if (!trimmed) return '<div class="h-2"></div>';
                                        // Headings
                                        if (trimmed.startsWith('### ')) return `<h4 class="text-amber-400 font-bold text-sm mt-3 mb-1">${trimmed.slice(4).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h4>`;
                                        if (trimmed.startsWith('## ')) return `<h3 class="text-teal-400 font-bold text-base mt-4 mb-2">${trimmed.slice(3).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h3>`;
                                        if (trimmed.startsWith('# ')) return `<h2 class="text-teal-300 font-bold text-lg mt-4 mb-2">${trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h2>`;
                                        // Bullets
                                        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) return `<div class="flex gap-2 ml-2 mb-1"><span class="text-teal-400 mt-0.5">•</span><span class="text-slate-200 text-sm">${trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')}</span></div>`;
                                        // Numbered lists
                                        if (/^\d+\.\s/.test(trimmed)) return `<div class="flex gap-2 ml-2 mb-1"><span class="text-teal-400 font-bold text-sm">${trimmed.match(/^\d+/)?.[0]}.</span><span class="text-slate-200 text-sm">${trimmed.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')}</span></div>`;
                                        // Regular paragraph with bold
                                        return `<p class="text-slate-200 text-sm leading-relaxed mb-1">${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')}</p>`;
                                    })
                                    .join('');
                            })() }} />
                        </ScrollArea>
                        <div className="p-4 border-t border-slate-700 space-y-3">
                            {isTeacher && (
                                <Button 
                                    className="w-full bg-teal-600 hover:bg-teal-500 text-white rounded-xl gap-2 font-bold py-5 shadow-lg shadow-teal-500/20 transition-all active:scale-95"
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
                            <p className="text-xs text-slate-500 text-center uppercase tracking-widest font-semibold opacity-50">Generated by EduNexus AI • {new Date().toLocaleTimeString()}</p>
                        </div>
                    </div>
                )}

                {/* Metrics Sidebar (Teacher Only) */}
                {isTeacher && showMetrics && (
                    <div className="absolute inset-y-0 right-0 w-full min-w-0 sm:relative sm:w-96 border-l border-slate-800 bg-slate-900/95 backdrop-blur-md flex flex-col animate-in slide-in-from-right duration-300 z-10">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-teal-400" />
                                <h3 className="font-semibold text-sm">Live Engagement AI</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowMetrics(false)} className="h-8 w-8 text-slate-500">
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                        <ScrollArea className="flex-1 p-4">
                            {sessionData ? (
                                <SessionMetrics
                                    engagementTimeline={sessionData.engagement_timeline || []}
                                    studentPresence={sessionData.student_presence || {}}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-500 italic">
                                    Loading live metrics...
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                )}

                {/* Sidebar Chat */}
                {showChat && (
                    <div className="absolute inset-y-0 right-0 w-full min-w-0 sm:relative sm:w-80 border-l border-slate-800 bg-slate-900 flex flex-col animate-in slide-in-from-right duration-300 z-10">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="font-semibold text-sm">Session Chat</h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowChat(false)} className="h-8 w-8 text-slate-500">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="flex-1 p-4 flex items-center justify-center text-slate-500 text-sm italic">
                            Real-time chat is being established...
                        </div>
                    </div>
                )}
            </div>

            {/* AI Floating Status - docked at bottom edge */}
            {!showMetrics && (
                <div className="flex items-center justify-center py-1 bg-slate-950 z-30">
                    <div className="bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 text-white/90 text-xs flex items-center gap-2 shadow-xl">
                        <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                        <span>AI monitoring active</span>
                    </div>
                </div>
            )}

        </div>
    );
};

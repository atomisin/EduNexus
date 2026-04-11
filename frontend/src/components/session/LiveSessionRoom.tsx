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
import { Video, MessageSquare, X, Sparkles, BarChart3, ChevronRight, FileText, PenTool, Camera, LogOut, Volume2, Mic, BookOpen, Maximize2, Zap, Activity, BarChart2, Users } from 'lucide-react';
import { SessionMetrics } from './SessionMetrics';
import { Whiteboard } from './Whiteboard';
import { VirtualBackgroundControl } from './VirtualBackgroundControl';
import { sessionAPI, engagementAPI, aiAPI } from '@/services/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { FloatingContentModal } from './FloatingContentModal';

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
    setFloatingContent
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
                    content: data.quiz.questions
                });
                toast(`New Pop Quiz: ${data.quiz.title}`, { icon: '📝', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            } else if (data.type === 'AI_CONTENT') {
                setFloatingContent({
                    type: 'notes',
                    content: data.data.content
                });
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
            toast.info("Generating lesson-specific quiz...");
            // Use topic/subject if available for better prompt
            const contextStr = title ? `lesson about: "${title}"` : 'current lesson';
            const prompt = `Generate a single multiple-choice question for a 30-second "Pop Quiz" during a live ${contextStr}. 
            Respond with ONLY valid JSON: {"question": "...", "options": ["A", "B", "C", "D"], "correct_answer": "A/B/C/D", "explanation": "..."}`;

            const response = await aiAPI.chat([{ role: 'user', content: prompt }], 'tutoring');
            const content = response.response || response.message || "";

            let quizData;
            try {
                const jsonMatch = content.match(/\{.*\}/s);
                quizData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch (e) {
                console.error("Failed to parse quiz JSON:", e);
            }

            if (!quizData) {
                quizData = {
                    question: `Quick check: What is the most important concept in ${title || 'this lesson'}?`,
                    options: ["Concept A", "Concept B", "The core principle", "All of the above"],
                    correct_answer: "C",
                    explanation: "Focus on the core principle!"
                };
            }

            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({
                type: 'POP_QUIZ',
                quiz: {
                    title: `Pop Quiz: ${title || 'Quick Check'}`,
                    questions: [{ id: `pop-${Date.now()}`, ...quizData }]
                }
            }));
            room.localParticipant.publishData(data, { reliable: true });
            toast.success("Pop Quiz triggered for all students!", { style: { color: '#fff', background: '#0d9488', fontWeight: '600' } });
        } catch (error) {
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
            <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-slate-700/50 shadow-2xl z-40">
                {!isTeacher && (
                    <div className="flex items-center gap-1 pr-3 border-r border-slate-700">
                        {['👍', '❤️', '👏', '😮', '🤔', '🔥'].map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => sendReaction(emoji)}
                                className="w-10 h-10 flex items-center justify-center hover:bg-slate-800 rounded-lg transition-colors text-xl"
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
                        className="rounded-xl gap-2 text-teal-400 hover:bg-teal-500/10"
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
    const [aiContent, setAiContent] = useState<{ title: string; content: string; pop_quiz?: any; assignment?: string } | null>(null);
    const [showAiContent, setShowAiContent] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [floatingContent, setFloatingContent] = useState<any>(null);

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

    // Poll for session metrics if teacher
    useEffect(() => {
        if (!isTeacher) return;

        const fetchMetrics = async () => {
            try {
                const data = await sessionAPI.get(sessionId);
                setSessionData(data.session || data);
            } catch (error) {
                console.error('Failed to fetch live metrics:', error);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 5000);
        return () => clearInterval(interval);
    }, [sessionId, isTeacher]);

    const handleSmartPrep = async () => {
        try {
            setAiLoading(true);
            toast('AI Helper is preparing your lesson materials...', { icon: '🤖', style: { color: '#fff', background: 'hsl(var(--primary))', fontWeight: '600' } });
            
            // In a real multi-student session, we might pick one or use average proficiency
            // For now, we'll use a placeholder or the first student from sessionData
            const studentId = sessionData?.student_presence ? Object.keys(sessionData.student_presence)[0] : null;
            if (!studentId) {
                toast.error("No students connected Yet!");
                return;
            }

            const response = await sessionAPI.prepareSmartLesson(studentId, sessionData.subject_id);
            if (response.success && response.materials) {
                const materials = response.materials;
                const contentData = {
                    title: `🤖 Smart Prep: ${response.topic}`,
                    content: `## Lesson Outline\n${materials.outline.map((p: string) => `- ${p}`).join('\n')}\n\n## Take-Home Assignment\n${materials.assignment}`,
                    pop_quiz: materials.pop_quiz,
                    assignment: materials.assignment
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

    return (
        <div className={`flex flex-col flex-1 min-h-0 bg-slate-950 text-white overflow-hidden transition-all duration-300 relative ${isTheaterMode ? 'rounded-none border-0' : 'rounded-2xl border border-slate-800 shadow-2xl'}`}>
            {/* Session Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between z-20">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center border border-teal-500/30">
                        <Video className="w-5 h-5 text-teal-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            {title}
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                Live
                            </Badge>
                        </h2>
                        <p className="text-xs text-slate-400">Room: {roomName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleTheater}
                        className="rounded-xl gap-2 text-slate-400 hover:text-white"
                        title={isTheaterMode ? "Exit Theater Mode" : "Theater Mode"}
                    >
                        {isTheaterMode ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        {isTheaterMode ? 'Exit' : 'Wide'}
                    </Button>
                    {isTeacher ? (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSmartPrep}
                                disabled={aiLoading}
                                className="rounded-xl gap-2 text-teal-400 hover:bg-teal-500/10 font-bold"
                                title="Use AI to prepare outline, quiz, and assignment"
                            >
                                <Sparkles className="w-4 h-4" />
                                {aiLoading ? 'Preparing...' : 'Smart Assistant'}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleGenerateNotes}
                                disabled={aiLoading}
                                className="rounded-xl gap-2 text-amber-400 hover:bg-amber-500/10"
                            >
                                <FileText className="w-4 h-4" />
                                {aiLoading ? '...' : 'Notes'}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => aiContent && setShowAiContent(true)}
                            className="rounded-xl gap-2 text-amber-400 hover:bg-amber-500/10"
                        >
                            <BookOpen className="w-4 h-4" />
                            {aiContent ? 'View Notes' : 'Notes'}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChat(!showChat)}
                        className={`rounded-xl gap-2 ${showChat ? 'bg-teal-500/20 text-teal-400' : 'text-slate-400'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        Chat
                    </Button>
                    <Button
                        variant={showVirtualBg ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setShowVirtualBg(true)}
                        className={`rounded-xl gap-2 ${showVirtualBg ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'}`}
                    >
                        <Camera className="w-4 h-4" />
                        Background
                    </Button>
                    {isTeacher ? (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onDisconnect}
                                className="rounded-xl gap-2 border-slate-700 text-slate-300 hover:bg-slate-800"
                            >
                                <LogOut className="w-4 h-4" />
                                Leave
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                    if (window.confirm("Are you sure you want to END the session for everyone? This will generate final notes and move it to history.")) {
                                        try {
                                            await sessionAPI.end(sessionId);
                                            onDisconnect();
                                        } catch (error) {
                                            console.error("Failed to end session:", error);
                                            toast.error("Failed to end session properly");
                                            onDisconnect();
                                        }
                                    }
                                }}
                                className="rounded-xl gap-2"
                            >
                                <X className="w-4 h-4" />
                                End Session
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={onDisconnect}
                            className="rounded-xl gap-2"
                        >
                            <X className="w-4 h-4" />
                            Leave
                        </Button>
                    )}
                    {isTeacher && (
                        <Button
                            variant={showWhiteboard ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setShowWhiteboard(!showWhiteboard)}
                            className={`rounded-xl gap-2 ${showWhiteboard ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'}`}
                        >
                            <PenTool className="w-4 h-4" />
                            Whiteboard
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex min-h-0 overflow-hidden relative">
                {/* Video Area */}
                <div className={`relative bg-black min-h-0 ${showWhiteboard ? 'w-1/2' : 'flex-1'}`}>
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
                            />
                            <RoomAudioRenderer />
                            {/* Audio gate overlay — shown until user clicks 'Join with Audio' */}
                            {!isAudioEnabled && (
                                <div className="absolute inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                                    <div className="w-20 h-20 rounded-full bg-teal-500/20 flex items-center justify-center mb-6 border border-teal-500/30 animate-pulse">
                                        <Volume2 className="w-10 h-10 text-teal-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2">Enable Audio to Join</h3>
                                    <p className="text-slate-400 max-w-md mb-2">Your browser requires a click to enable audio.</p>
                                    <p className="text-slate-500 text-sm max-w-md mb-8">
                                        If you see a mic timeout warning in the console, it will clear once audio is enabled here.
                                    </p>
                                    <Button
                                        size="lg"
                                        className="rounded-2xl px-12 py-7 text-lg font-bold bg-teal-600 hover:bg-teal-500 shadow-xl shadow-teal-500/20 group transition-all"
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
                <div className={`border-l border-slate-800 transition-all duration-300 ${showWhiteboard ? 'w-1/2 opacity-100' : 'w-0 opacity-0 overflow-hidden pointer-events-none'}`}>
                    <Whiteboard room={room} isTeacher={isTeacher} visible={showWhiteboard} />
                </div>

                {/* AI Explanations / Notes Panel */}
                {showAiContent && aiContent && (
                    <div className="absolute inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-700 flex flex-col z-[60] animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                <h3 className="font-semibold text-sm text-white">{aiContent.title}</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowAiContent(false)} className="h-8 w-8 text-slate-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <ScrollArea className="flex-1 overflow-y-auto">
                            <div className="p-5 prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: (() => {
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
                                                // 1. Push Pop Quiz
                                                const quizData = encoder.encode(JSON.stringify({ 
                                                    type: 'POP_QUIZ', 
                                                    quiz: {
                                                        title: `Quick Quiz: ${title}`,
                                                        questions: aiContent.pop_quiz
                                                    } 
                                                }));
                                                room.localParticipant.publishData(quizData, { reliable: true });

                                                // 2. Push Notes too
                                                const notesData = encoder.encode(JSON.stringify({ type: 'AI_CONTENT', data: aiContent }));
                                                room.localParticipant.publishData(notesData, { reliable: true });

                                                // 3. Send to Student Inboxes (Task 4)
                                                try {
                                                    await sessionAPI.pushContent(sessionId, {
                                                        content_type: 'pop_quiz',
                                                        content: aiContent.pop_quiz
                                                    });
                                                } catch (e) {
                                                    console.warn("Failed to push to inbox:", e);
                                                }

                                                toast.success("Quiz and Notes pushed to students!");
                                            } else {
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
                    <div className="w-96 border-l border-slate-800 bg-slate-900/95 backdrop-blur-md flex flex-col animate-in slide-in-from-right duration-300 z-10">
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
                    <div className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col animate-in slide-in-from-right duration-300 z-10">
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

            {/* Virtual Background Control */}
            <VirtualBackgroundControl
                localVideoTrack={localVideoTrack}
                isOpen={showVirtualBg}
                onClose={() => setShowVirtualBg(false)}
            />
        </div>
    );
};

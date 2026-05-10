import React, { useState, useEffect, Suspense } from 'react';
import {
  Brain, CheckCircle, Video, BookOpen, Trophy, Menu, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import ThemeToggle from '@/components/ThemeToggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { LegalDocument, legalDocuments } from '@/components/legal/LegalDocuments';

// Lazy load heavy auth components
const LoginForm = React.lazy(() => import('@/components/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const RegistrationPage = React.lazy(() => import('../auth/RegistrationPage').then(m => ({ default: m.RegistrationPage })));

interface LandingPageProps {
  user?: any;
  onLogin: () => void;
  onRegister: () => void;
  onAdmin: () => void;
  onJoinSession?: () => void;
  onGoDashboard?: () => void;
}

export const LandingPage = ({
  user,
  onLogin,
  onRegister,
  onAdmin,
  onJoinSession,
  onGoDashboard
}: LandingPageProps) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [legalDocument, setLegalDocument] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth === 'login') setAuthMode('login');
    else if (auth === 'register') setAuthMode('register');
  }, []);

  useEffect(() => {
    if (user && authMode === null) {
      onGoDashboard?.();
    }
  }, [authMode, onGoDashboard, user]);

  const features = [
    { icon: Brain, title: 'Structured AI tutoring', desc: 'Students learn through guided explanations, worked examples, quick checks, and mastery quizzes that respond to their level of understanding.', color: 'text-primary' },
    { icon: Video, title: 'Live learning with teachers', desc: 'Teachers can run real-time classes, share notes, launch quizzes, and keep students engaged inside one connected classroom workspace.', color: 'text-primary' },
    { icon: BookOpen, title: 'Curriculum-aware pathways', desc: 'Lessons, revision checks, placement tests, and recommendations stay aligned with the learner’s class, subject, term, and unlocked progress.', color: 'text-primary' },
    { icon: Trophy, title: 'Measurable progress', desc: 'Dashboards turn activity, mastery, scores, and weak areas into clear next steps for students, teachers, and school leaders.', color: 'text-primary' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/edunexus-logo.png" alt="EduNexus" className="h-12 w-auto object-contain" />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Platform</a>
              <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Organization</a>
              <div className="h-6 w-px bg-border mx-2"></div>
              <ThemeToggle />
              <div className="h-6 w-px bg-border mx-2"></div>
              {user && onGoDashboard ? (
                <Button onClick={onGoDashboard} className="bg-primary text-primary-foreground rounded-lg font-semibold px-6 hover:bg-primary/90 transition-all shadow-md">
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button onClick={() => setAuthMode('login')} variant="outline" className="font-semibold px-6 rounded-lg font-display">
                    Sign In
                  </Button>
                  <Button onClick={() => setAuthMode('register')} className="bg-primary text-primary-foreground rounded-lg font-semibold px-6 border hover:bg-primary/90 transition-all shadow-md font-display">
                    Get Started
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Navigation */}
            <div className="flex md:hidden items-center gap-4">
              <ThemeToggle />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[min(22rem,calc(100vw-1rem))] px-5 py-5 sm:px-6 [&>button]:hidden"
                >
                  <div className="flex items-center justify-between gap-4">
                    <SheetTitle className="font-display text-2xl leading-none">Menu</SheetTitle>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Close menu">
                        <X className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                  </div>
                  <div className="mt-10 flex min-w-0 flex-col gap-2">
                    <a href="#features" className="rounded-lg px-1 py-3 text-base font-semibold hover:text-primary transition-colors">Platform</a>
                    <a href="#about" className="rounded-lg px-1 py-3 text-base font-semibold hover:text-primary transition-colors">Organization</a>
                    <Separator className="my-5" />
                    {user && onGoDashboard ? (
                      <Button onClick={onGoDashboard} className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-lg">
                        Go to Dashboard
                      </Button>
                    ) : (
                      <>
                        <Button onClick={() => setAuthMode('login')} variant="outline" className="w-full h-12 font-semibold rounded-lg">
                          Sign In
                        </Button>
                        <Button onClick={() => setAuthMode('register')} className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-lg">
                          Get Started
                        </Button>
                      </>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[92vh] overflow-hidden border-b border-border">
        <img
          src="/images/Whisk_ygohrtzlddm3mmym1yy2uwotq2n3qtl0idox0co.jpeg"
          alt="Students learning attentively in a modern environment"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-16 min-h-[92vh] flex items-end">
            <div className="max-w-3xl space-y-8 animate-fade-in text-white">
              <Badge variant="secondary" className="px-3 py-1 font-medium bg-secondary text-secondary-foreground rounded-full">
                Built for serious learning
              </Badge>

              <h1 className="text-5xl lg:text-7xl font-bold leading-tight tracking-tight font-display">
                EduNexus
              </h1>

              <p className="text-xl text-white/80 leading-relaxed max-w-2xl">
                A modern learning platform for students, teachers, and schools. EduNexus combines structured AI tutoring, live classroom tools, curriculum pathways, and progress intelligence in one academic workspace.
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                <Button size="lg" className="bg-primary text-primary-foreground rounded-lg px-8 font-semibold" onClick={() => setAuthMode('register')}>
                  Start Learning
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 border-white/40 text-white bg-white/10 hover:bg-white/20 rounded-lg"
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Explore the Platform
                </Button>
                {onJoinSession && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-8 border-white/40 text-white bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"
                    onClick={onJoinSession}
                  >
                    <Video className="w-5 h-5" /> Join a Live Session
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-6 text-sm font-medium text-white/75 border-t border-white/20">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Curriculum-aware lessons
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Placement-based lesson unlocking
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> AI and teacher-led learning
                </div>
              </div>
            </div>
        </div>
      </section>


      {/* Features Section */}
      <section id="features" className="py-32 px-6 bg-subtle">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              A Complete Academic Workspace
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              EduNexus is designed for the full learning cycle: prepare, teach, practise, assess, revise, and progress with evidence.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-16 items-center">
            <div className="order-2 md:order-1 relative rounded-lg overflow-hidden border border-border aspect-[4/3]">
              <img
                src="/images/Whisk_yzy4m2mhvznxcjm50sn0ymytajnmrtlykjn10sm.jpeg"
                alt="Focused student at desk"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="order-1 md:order-2 space-y-10">
              {features.map((feature, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="hidden sm:flex shrink-0 w-14 h-14 rounded-lg bg-background border border-border shadow-sm items-center justify-center transition-colors group-hover:border-primary">
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                      <feature.icon className={`w-5 h-5 sm:hidden ${feature.color}`} />
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="py-28 px-6 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto grid gap-12 lg:grid-cols-[0.9fr_1.1fr] items-start">
          <div className="space-y-5">
            <Badge variant="outline" className="rounded-lg border-primary/30 text-primary">Platform model</Badge>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
              Built around understanding, not just access.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              EduNexus helps learners move with confidence by checking readiness before advanced lessons, revising prerequisite work when needed, and keeping every learning decision tied to evidence.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { title: 'For students', text: 'A focused learning workspace with AI tutoring, voice support, practice, recommended videos, reading materials, and mastery checks.' },
              { title: 'For teachers', text: 'Classroom tools for live sessions, lesson preparation, shared content, mid-class quizzes, assignments, and student insight.' },
              { title: 'For schools', text: 'Operational dashboards, user approvals, curriculum materials, cost visibility, and progress reporting across learners.' },
              { title: 'For professional learners', text: 'Custom courses, technical explanations, applied questions, and learning paths beyond the standard school curriculum.' },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-subtle/50 p-6">
                <h3 className="font-bold text-lg text-foreground mb-2">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 bg-foreground text-background">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-5xl lg:text-6xl font-bold font-display">
            Start Learning Today
          </h2>
          <p className="text-xl text-muted max-w-2xl mx-auto leading-relaxed opacity-90">
            Create a learning path that knows what the student understands, what they missed, and what they should study next.
          </p>
          <div className="flex flex-wrap justify-center gap-6 pt-8">
            <Button size="lg" className="bg-background text-foreground hover:bg-background/90 font-semibold px-10 rounded-lg" onClick={() => setAuthMode('register')}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" className="border-background text-background hover:bg-background/10 font-semibold px-10 rounded-lg bg-transparent" onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}>
              See Platform Model
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-primary py-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "17", label: "Learning Levels" },
            { value: "AI + Live", label: "Tutor Modes" },
            { value: "85%", label: "Unlock Benchmark" },
            { value: "360°", label: "Progress View" }
          ].map(stat => (
            <div key={stat.label} className="text-primary-foreground">
              <div className="text-3xl font-display font-bold text-accent mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-primary-foreground/70">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <img src="/edunexus-logo.png" alt="EduNexus" className="h-10 w-auto" />
                <span className="font-display font-bold text-xl text-foreground">EduNexus</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A structured academic platform for AI tutoring, live teaching, curriculum pathways, and measurable progress.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-6 text-sm uppercase tracking-widest">Platform</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="hover:text-primary cursor-pointer transition-colors">AI Tutor</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Live Classroom</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Progress Analytics</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Mastery Checks</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-6 text-sm uppercase tracking-widest">Learners</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="hover:text-primary cursor-pointer transition-colors">Primary</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Junior Secondary</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Senior Secondary</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Professional</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-6 text-sm uppercase tracking-widest">Organization</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="hover:text-primary cursor-pointer transition-colors">Teacher tools</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Admin dashboard</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Curriculum materials</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Reports</li>
              </ul>
            </div>
          </div>
          <Separator className="bg-border/60" />
          <div className="flex flex-wrap items-center justify-center gap-4 pt-6 text-sm">
            <button
              type="button"
              onClick={() => setLegalDocument('terms')}
              className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setLegalDocument('privacy')}
              className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Privacy Policy
            </button>
          </div>
          <div className="flex flex-col flex-col-reverse md:flex-row items-center justify-between pt-8 gap-6 text-sm text-muted-foreground">
            <p className="font-medium tracking-wide">© 2026 EduNexus. Structured learning for measurable progress.</p>
          </div>
        </div>
      </footer>

      <Dialog open={legalDocument !== null} onOpenChange={(open) => !open && setLegalDocument(null)}>
        <DialogContent className="max-h-[88vh] w-[calc(100vw-1rem)] max-w-2xl overflow-hidden p-0">
          {legalDocument && (
            <>
              <div className="border-b px-5 py-4 text-left">
                <DialogTitle className="pr-8 text-xl leading-tight">
                  {legalDocuments[legalDocument].title}
                </DialogTitle>
                <DialogDescription className="mt-2">
                  EduNexus account, learning, safety, and data commitments.
                </DialogDescription>
              </div>
              <div className="max-h-[68vh] overflow-y-auto overflow-x-hidden px-5 py-4">
                <LegalDocument type={legalDocument} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Auth Overlays */}
      <Dialog open={authMode !== null} onOpenChange={(open) => !open && setAuthMode(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none bg-transparent shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">
            {authMode === 'login' ? 'Sign in to EduNexus' : 'Create an EduNexus account'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {authMode === 'login' ? 'Enter your email and password to continue.' : 'Complete the registration form to create your account.'}
          </DialogDescription>
          <div className="relative animate-in zoom-in-95 duration-200">
            <Suspense fallback={
              <div className="p-12 flex flex-col items-center justify-center bg-background rounded-lg">
                <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground font-medium animate-pulse">Initializing Portal...</p>
              </div>
            }>
              {authMode === 'login' ? (
                <LoginForm 
                  onSuccess={() => {
                    setAuthMode(null);
                  }}
                  onRegisterClick={() => setAuthMode('register')}
                />
              ) : (
                <div className="max-h-[85vh] overflow-y-auto rounded-lg bg-background shadow-xl">
                  <RegistrationPage 
                    onSuccess={() => {
                      setAuthMode('login');
                      toast.success('Registration successful! Please login.');
                    }}
                    onBack={() => setAuthMode('login')}
                    isModal={true}
                  />
                </div>
              )}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


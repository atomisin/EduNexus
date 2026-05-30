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
  const closeAuthModal = React.useCallback(() => {
    setAuthMode(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has('auth')) {
      url.searchParams.delete('auth');
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', nextUrl || '/');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth === 'login') setAuthMode('login');
    else if (auth === 'register') setAuthMode('register');
  }, []);

  useEffect(() => {
    if (user && authMode !== null) {
      closeAuthModal();
    }
  }, [authMode, closeAuthModal, user]);

  useEffect(() => {
    if (user && authMode === null) {
      onGoDashboard?.();
    }
  }, [authMode, onGoDashboard, user]);

  const features = [
    { icon: Brain, title: 'Guided AI tutoring', desc: 'Students learn in small, clear steps with explanations, examples, quick checks, and mastery practice that adjust to what they really understand.', color: 'text-primary' },
    { icon: Video, title: 'Live teaching that stays connected', desc: 'Teachers can teach live, share notes, launch checks, and keep classwork, follow-up, and revision in one place.', color: 'text-primary' },
    { icon: BookOpen, title: 'Curriculum-aware learning paths', desc: 'Lessons, revision, placement checks, and recommendations stay tied to the learner\'s class, subject, term, and actual progress.', color: 'text-primary' },
    { icon: Trophy, title: 'Progress you can trust', desc: 'Students, teachers, and schools get clear signals on what is working, what is weak, and what to do next.', color: 'text-primary' },
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
      <section className="relative min-h-screen overflow-hidden border-b border-border">
        <img
          src="/images/Whisk_ygohrtzlddm3mmym1yy2uwotq2n3qtl0idox0co.jpeg"
          alt="Students learning attentively in a modern environment"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-background/88" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/94 via-background/78 to-background/62" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/78 to-transparent" />
        <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-5 pb-14 pt-28 sm:px-6 sm:pt-32 lg:items-end lg:pb-16">
            <div className="max-w-3xl space-y-6 animate-fade-in rounded-lg bg-background/18 px-2 py-2 text-white backdrop-blur-[2px] sm:space-y-8 sm:px-3 sm:py-3 lg:-ml-2">
              <Badge variant="secondary" className="rounded-full bg-background/85 px-3 py-1 font-medium text-foreground">
                Built for clear progress
              </Badge>

              <h1 className="text-4xl font-bold leading-tight tracking-tight font-display text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:text-5xl lg:text-7xl">
                EduNexus
              </h1>

              <p className="max-w-2xl text-base leading-relaxed text-white/95 drop-shadow-[0_4px_14px_rgba(0,0,0,0.4)] sm:text-xl">
                One learning platform for students, teachers, and schools. EduNexus brings guided tutoring, live teaching, structured curriculum paths, and dependable progress signals into one calm academic workspace.
              </p>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:gap-4 sm:pt-4">
                <Button size="lg" className="rounded-lg bg-primary px-8 font-semibold text-primary-foreground" onClick={() => setAuthMode('register')}>
                  Start Learning
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-lg border-white/35 bg-white/10 px-8 text-white hover:bg-white/20"
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Explore the Platform
                </Button>
                {onJoinSession && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex items-center gap-2 rounded-lg border-white/35 bg-white/10 px-8 text-white hover:bg-white/20"
                    onClick={onJoinSession}
                  >
                    <Video className="w-5 h-5" /> Join a Live Session
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 border-t border-white/16 pt-5 text-sm font-medium text-white/92 drop-shadow-[0_4px_12px_rgba(0,0,0,0.32)] sm:gap-6 sm:pt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" /> Curriculum-aware lessons
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" /> Placement-based lesson unlocking
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" /> AI support with teacher oversight
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
              Everything learning needs, in one place
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              EduNexus helps learners move from explanation to practice to evidence-backed progress without losing context along the way.
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
            <Badge variant="outline" className="rounded-lg border-primary/30 text-primary">How it works</Badge>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
              Built to help people understand, not just log in.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              EduNexus checks readiness before harder lessons, helps learners repair missing foundations, and keeps every next step tied to real learning evidence.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { title: 'For students', text: 'A focused learning workspace with tutoring, practice, revision help, recommended videos, and mastery checks.' },
              { title: 'For teachers', text: 'Live teaching tools, prep support, shared class content, quick checks, assignments, and learner insight.' },
              { title: 'For schools', text: 'Approvals, curriculum control, usage visibility, reporting, and quality oversight in one workspace.' },
              { title: 'For professional learners', text: 'Custom courses, technical explanations, applied practice, and structured learning beyond the regular school path.' },
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
            Start with one clear next step
          </h2>
          <p className="text-xl text-muted max-w-2xl mx-auto leading-relaxed opacity-90">
            Give each learner a platform that can explain well, check honestly, and point them to the right next move.
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
                  Terms, privacy, and the commitments that protect learners, teachers, and schools.
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
        <DialogContent className={`overflow-hidden border-none bg-transparent p-0 shadow-none [&>button]:hidden ${authMode === 'login' ? 'max-w-md' : 'max-w-[min(72rem,calc(100vw-1rem))]'}`}>
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
                <p className="text-muted-foreground font-medium animate-pulse">Opening secure access...</p>
              </div>
            }>
                {authMode === 'login' ? (
                  <LoginForm 
                    onSuccess={closeAuthModal}
                    onBackClick={closeAuthModal}
                    onRegisterClick={() => setAuthMode('register')}
                  />
                ) : (
                  <div className="rounded-lg bg-transparent shadow-none">
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




























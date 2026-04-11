import { useState, useEffect } from 'react';
import {
  Brain, ToggleLeft, Target, Network, ChevronRight, CheckCircle,
  Video, Settings, BookOpen, Trophy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegistrationPage } from '../auth/RegistrationPage';
import ThemeToggle from '@/components/ThemeToggle';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth === 'login') setAuthMode('login');
    else if (auth === 'register') setAuthMode('register');
  }, []);

  const features = [
    { icon: Brain, title: 'AI Tutor, Always Available', desc: 'Get instant explanations, worked examples, and practice questions tailored to your level — any time, any subject.', color: 'text-primary' },
    { icon: Video, title: 'Live Sessions with Real Teachers', desc: 'Book one-on-one or group sessions with verified Nigerian teachers. Learn in real time, ask questions, get answers.', color: 'text-primary' },
    { icon: BookOpen, title: 'Curriculum-Aligned Materials', desc: 'Every topic mapped to the Nigerian curriculum — from Basic Science in Primary 1 to Further Mathematics in SS3.', color: 'text-primary' },
    { icon: Trophy, title: 'Track Your Progress', desc: 'Brain Power points, streaks, and detailed progress reports keep students motivated and parents informed.', color: 'text-primary' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <img src="/edunexus-logo.png" alt="EduNexus" className="h-[100px] w-auto" />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Platform</a>
              <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Organization</a>
              <a href="#contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Contact</a>
              <div className="h-6 w-px bg-border mx-2"></div>
              <ThemeToggle />
              <div className="h-6 w-px bg-border mx-2"></div>
              {user && onGoDashboard ? (
                <Button onClick={onGoDashboard} className="bg-primary text-primary-foreground rounded-lg font-semibold px-6 hover:bg-primary/90 transition-all shadow-md">
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button onClick={() => setAuthMode('login')} variant="outline" className="font-semibold px-6 rounded-lg">
                    Sign In
                  </Button>
                  <Button onClick={() => setAuthMode('register')} className="bg-primary text-primary-foreground rounded-lg font-semibold px-6 border hover:bg-primary/90 transition-all shadow-md">
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-subtle" />
        <div className="relative max-w-7xl mx-auto px-6 pt-12">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8 animate-fade-in">
              <Badge variant="secondary" className="px-3 py-1 font-medium bg-secondary text-secondary-foreground rounded-full">
                Built for Nigerian Students
              </Badge>

              <h1 className="text-5xl lg:text-7xl font-bold leading-tight text-foreground tracking-tight font-display">
                Unlock Your Full <br />
                Academic Potential
              </h1>

              <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
                EduNexus combines AI-powered tutoring, live sessions, and curriculum-aligned materials to help students from Pre-Primary through SS3 — and beyond — achieve more.
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                <Button size="lg" className="bg-primary text-primary-foreground rounded-lg px-8 font-semibold" onClick={() => setAuthMode('register')}>
                  Start Learning Free →
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 border-border rounded-lg"
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  See How It Works
                </Button>
                {onJoinSession && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-8 border-primary text-primary rounded-lg flex items-center gap-2"
                    onClick={onJoinSession}
                  >
                    <Video className="w-5 h-5" /> Join a Live Session
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-6 pt-6 text-sm font-medium text-muted-foreground border-t border-border/50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Nigerian Curriculum Aligned
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> JSS & SS Coverage
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Live 1-on-1 Tutoring
                </div>
              </div>
            </div>

            <div className="relative animate-fade-in delay-200 lg:h-[600px] flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/5 rounded-[2.5rem] transform rotate-3 scale-105" />
              <img
                src="/images/Whisk_ygohrtzlddm3mmym1yy2uwotq2n3qtl0idox0co.jpeg"
                alt="Students learning attentively in a modern environment"
                className="relative z-10 w-full h-full object-cover rounded-[2rem] shadow-2xl border border-border/50"
              />
            </div>
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section id="features" className="py-32 px-6 bg-subtle">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              Amazing Features
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Everything you need to succeed in your studies.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-16 items-center">
            <div className="order-2 md:order-1 relative rounded-[2rem] overflow-hidden shadow-2xl border border-border aspect-[4/3]">
              <img
                src="/images/Whisk_yzy4m2mhvznxcjm50sn0ymytajnmrtlykjn10sm.jpeg"
                alt="Focused student at desk"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="order-1 md:order-2 space-y-10">
              {features.map((feature, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="hidden sm:flex shrink-0 w-14 h-14 rounded-xl bg-background border border-border shadow-sm items-center justify-center transition-colors group-hover:border-primary">
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

      {/* CTA Section */}
      <section className="py-32 px-6 bg-foreground text-background">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-5xl lg:text-6xl font-bold font-display">
            Start Learning Today
          </h2>
          <p className="text-xl text-muted max-w-2xl mx-auto leading-relaxed opacity-90">
            Join EduNexus and take control of your education.
          </p>
          <div className="flex flex-wrap justify-center gap-6 pt-8">
            <Button size="lg" className="bg-background text-foreground hover:bg-background/90 font-semibold px-10 rounded-lg" onClick={onRegister}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" className="border-background text-background hover:bg-background/10 font-semibold px-10 rounded-lg bg-transparent">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-primary py-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "17", label: "Education Levels" },
            { value: "JSS–SS3", label: "Full Coverage" },
            { value: "AI + Live", label: "Dual Learning" },
            { value: "🇳🇬", label: "Nigerian Curriculum" }
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
                Empowering Nigerian learners with precision educational tools for modern academic environments.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-6 text-sm uppercase tracking-widest">Platform</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="hover:text-primary cursor-pointer transition-colors">Architecture</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Organizations</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Individuals</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Metrics</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-6 text-sm uppercase tracking-widest">Enterprise</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="hover:text-primary cursor-pointer transition-colors">About</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Contact</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Careers</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-6 text-sm uppercase tracking-widest">Legal</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li className="hover:text-primary cursor-pointer transition-colors">Privacy</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Terms</li>
                <li className="hover:text-primary cursor-pointer transition-colors">Compliance</li>
              </ul>
            </div>
          </div>
          <Separator className="bg-border/60" />
          <div className="flex flex-col flex-col-reverse md:flex-row items-center justify-between pt-8 gap-6 text-sm text-muted-foreground">
            <p className="font-medium tracking-wide">© 2025 EduNexus. Empowering Nigerian learners.</p>
          </div>
        </div>
      </footer>

      {/* Floating Auth Overlays */}
      <Dialog open={authMode !== null} onOpenChange={(open) => !open && setAuthMode(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none bg-transparent shadow-none [&>button]:hidden">
          <div className="relative animate-in zoom-in-95 duration-200">
            {authMode === 'login' ? (
              <LoginForm 
                onSuccess={() => {
                  setAuthMode(null);
                  onGoDashboard?.();
                }}
                onRegisterClick={() => setAuthMode('register')}
              />
            ) : (
              <div className="max-h-[85vh] overflow-y-auto rounded-xl bg-background shadow-2xl">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

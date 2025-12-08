import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  Users, 
  Stethoscope, 
  ClipboardCheck, 
  Shield, 
  Phone, 
  QrCode, 
  Heart, 
  Activity,
  ArrowRight,
  CheckCircle
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
          <Logo size="md" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" data-testid="link-login">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
        <div className="max-w-7xl mx-auto px-6 py-24 md:py-32 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Heart className="h-4 w-4" />
              Peer Support for Your Healthcare Journey
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Connect with peers through your{" "}
              <span className="text-primary">joint replacement</span> journey
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
              TeddyBridge connects patients for peer-to-peer support and enables doctors 
              to monitor outcomes with PROMS tracking. All in a secure, HIPAA-compliant platform.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup/patient">
                <Button size="lg" className="min-w-[180px]" data-testid="button-patient-signup">
                  <Users className="h-5 w-5 mr-2" />
                  I&apos;m a Patient
                </Button>
              </Link>
              <Link href="/signup/doctor">
                <Button size="lg" variant="outline" className="min-w-[180px]" data-testid="button-doctor-signup">
                  <Stethoscope className="h-5 w-5 mr-2" />
                  I&apos;m a Doctor
                </Button>
              </Link>
            </div>
            
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-green-600" />
                HIPAA Compliant
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" />
                Powered by CareBridge AI
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              TeddyBridge makes healthcare coordination simple and secure
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center hover-elevate">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Connect with Peers</h3>
                <p className="text-muted-foreground">
                  Find and connect with other patients going through similar procedures 
                  for support and shared experiences.
                </p>
              </CardContent>
            </Card>
            
            <Card className="text-center hover-elevate">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Schedule & Call</h3>
                <p className="text-muted-foreground">
                  Schedule calls with your peer connections at convenient times. 
                  Voice calls connect you securely via phone.
                </p>
              </CardContent>
            </Card>
            
            <Card className="text-center hover-elevate">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <QrCode className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Link to Your Doctor</h3>
                <p className="text-muted-foreground">
                  Scan your doctor&apos;s QR code to securely link your profile 
                  for PROMS tracking and outcome monitoring.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium mb-4">
                <Users className="h-4 w-4" />
                For Patients
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                You&apos;re Not Alone in This Journey
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Connect with peers who understand what you&apos;re going through. 
                Share experiences, ask questions, and support each other through 
                your joint replacement recovery.
              </p>
              
              <ul className="space-y-3 mb-8">
                {[
                  "Find peers by procedure type",
                  "Send connection requests via email",
                  "Schedule voice calls at your convenience",
                  "Track your recovery with PROMS surveys",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-foreground">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              
              <Link href="/signup/patient">
                <Button data-testid="button-patient-cta">
                  Get Started as Patient
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
            
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8">
              <div className="bg-card rounded-xl shadow-lg p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Patient Connections</p>
                    <p className="text-sm text-muted-foreground">3 confirmed peers</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Upcoming Call</p>
                    <p className="text-sm text-muted-foreground">Tomorrow at 2:00 PM</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <ClipboardCheck className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold">PROMS Survey</p>
                    <p className="text-sm text-muted-foreground">Post-op survey pending</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8">
              <div className="bg-card rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold">PROMS Dashboard</h4>
                  <span className="text-sm text-muted-foreground">Today</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">John D.</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">Done</span>
                      <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">Send</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">Sarah M.</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">Done</span>
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">Done</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="font-medium">Mike R.</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full">Sent</span>
                      <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full">-</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium mb-4">
                <Stethoscope className="h-4 w-4" />
                For Doctors
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Track Patient Outcomes with Ease
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                PROMSBridge helps you collect and monitor patient-reported outcomes. 
                Send surveys, track progress, and generate reports for billable codes.
              </p>
              
              <ul className="space-y-3 mb-8">
                {[
                  "Automated pre/post-op PROMS surveys",
                  "REDCap integration for data collection",
                  "Doctor-to-doctor secure calls with transcription",
                  "AI-powered call summaries",
                  "Generate billable code reports",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-foreground">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              
              <Link href="/signup/doctor">
                <Button data-testid="button-doctor-cta">
                  Get Started as Doctor
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Security & Compliance
          </h2>
          <p className="text-muted-foreground mb-8">
            Your health data is protected with enterprise-grade security
          </p>
          
          <div className="grid sm:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="pt-6 pb-4 px-4 text-center">
                <Shield className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">HIPAA Compliant</h3>
                <p className="text-sm text-muted-foreground">
                  Full compliance with healthcare data regulations
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 pb-4 px-4 text-center">
                <Activity className="h-10 w-10 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-1">End-to-End Encryption</h3>
                <p className="text-sm text-muted-foreground">
                  All data encrypted in transit and at rest
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 pb-4 px-4 text-center">
                <ClipboardCheck className="h-10 w-10 text-purple-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Audit Logging</h3>
                <p className="text-sm text-muted-foreground">
                  Complete audit trail for all data access
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-primary-foreground/80 mb-8 text-lg">
            Join TeddyBridge today and connect with peers or start tracking patient outcomes.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup/patient">
              <Button 
                size="lg" 
                variant="secondary" 
                className="min-w-[180px]"
                data-testid="button-patient-footer"
              >
                Sign Up as Patient
              </Button>
            </Link>
            <Link href="/signup/doctor">
              <Button 
                size="lg" 
                variant="outline" 
                className="min-w-[180px] bg-transparent border-primary-foreground/30 text-primary-foreground"
                data-testid="button-doctor-footer"
              >
                Sign Up as Doctor
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo size="sm" />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Powered by CareBridge AI</span>
              <span className="flex items-center gap-1">
                <Shield className="h-4 w-4 text-green-600" />
                HIPAA Compliant
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

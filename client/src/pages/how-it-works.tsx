import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { 
  Users,
  Stethoscope,
  ClipboardCheck,
  Phone,
  QrCode,
  Heart,
  ArrowRight,
  CheckCircle,
  LogIn,
  Menu,
  X,
  MessageSquare,
  BarChart3,
  Search,
  UserCheck
} from "lucide-react";

export default function HowItWorks() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Force light mode on this page
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header - Matching SalesPatriot style with scroll effect */}
      <header className="sticky top-0 z-50 w-full transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className={`flex h-16 items-center justify-between gap-4 px-6 rounded-full transition-all duration-300 ${
            isScrolled 
              ? "bg-white shadow-lg border border-gray-200" 
              : "bg-transparent"
          }`}>
            <Link href="/">
              <Logo size="md" />
            </Link>
            
            <div className="flex items-center gap-6">
              <div className="hidden lg:flex items-center gap-6 text-sm">
                <Link href="/patient" className="block duration-150 transition-colors text-gray-700 hover:text-gray-900">
                  <span>Patients</span>
                </Link>
                <Link href="/doctor" className="block duration-150 transition-colors text-gray-700 hover:text-gray-900">
                  <span>Doctors</span>
                </Link>
                <Link href="/about" className="block duration-150 transition-colors text-gray-700 hover:text-gray-900">
                  <span>About</span>
                </Link>
                <Link href="/how-it-works" className="block duration-150 transition-colors text-gray-700 hover:text-gray-900 font-medium">
                  <span>How it Works</span>
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/login" className="hidden sm:block">
                  <Button variant="default" className="bg-primary hover:bg-primary/90 flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    <span className="hidden md:inline">Log In</span>
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                  {isMobileMenuOpen ? (
                    <X className="h-6 w-6 text-gray-700" />
                  ) : (
                    <Menu className="h-6 w-6 text-gray-700" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden mt-4 px-6">
              <div className={`rounded-2xl transition-all duration-300 ${
                isScrolled 
                  ? "bg-white shadow-lg border border-gray-200" 
                  : "bg-white/95 backdrop-blur shadow-lg border border-gray-200"
              }`}>
                <div className="flex flex-col p-4 gap-3">
                  <Link 
                    href="/patient" 
                    className="block px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Patients
                  </Link>
                  <Link 
                    href="/doctor" 
                    className="block px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Doctors
                  </Link>
                  <Link 
                    href="/about" 
                    className="block px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    About
                  </Link>
                  <Link 
                    href="/how-it-works" 
                    className="block px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    How it Works
                  </Link>
                  <Link 
                    href="/login" 
                    className="block"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Button variant="default" className="w-full bg-primary hover:bg-primary/90 flex items-center justify-center gap-2">
                      <LogIn className="h-4 w-4" />
                      Log In
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              How TeddyBridge Works
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Connecting patients with peers and empowering doctors with PROMS analytics—all in one seamless platform.
            </p>
          </div>
        </div>
      </section>

      {/* For Patients Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                For Patients
              </h2>
              <p className="text-lg text-gray-600">
                Find and connect with peers who understand your journey
              </p>
            </div>

            <div className="space-y-12">
              {/* Step 1 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    1
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <Search className="h-6 w-6 text-blue-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Create Your Profile</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Sign up and create your patient profile. Share information about your procedure type, recovery stage, and preferences. Your privacy is protected—only share what you're comfortable with.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    2
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <UserCheck className="h-6 w-6 text-blue-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Find Matching Peers</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Our intelligent matching system connects you with peers who have similar procedures, demographics, and recovery timelines. View match percentages and compatibility scores when both parties consent.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    3
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <MessageSquare className="h-6 w-6 text-blue-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Connect & Communicate</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Start conversations, schedule calls, or join video meetings with your matched peers. Share experiences, offer support, and build meaningful connections throughout your recovery journey.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    4
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <ClipboardCheck className="h-6 w-6 text-blue-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Track Your Progress</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Complete PROMS surveys sent by your doctors, track your health metrics, and monitor your recovery progress over time. Your data helps improve care for you and future patients.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Doctors Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <Stethoscope className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                For Doctors
              </h2>
              <p className="text-lg text-gray-600">
                Streamline PROMS management and track patient outcomes
              </p>
            </div>

            <div className="space-y-12">
              {/* Step 1 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-xl font-bold">
                    1
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <Users className="h-6 w-6 text-green-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Link Your Patients</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Invite patients to join your network using unique QR codes or email links. Patients can easily connect with you and access their personalized dashboard.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-xl font-bold">
                    2
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <ClipboardCheck className="h-6 w-6 text-green-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Send PROMS Surveys</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Send pre-op and post-op surveys to your patients through the platform or via REDCap integration. Track survey completion status and monitor patient responses in real-time.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-xl font-bold">
                    3
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <BarChart3 className="h-6 w-6 text-green-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Analyze Outcomes</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    View comprehensive analytics and insights from patient responses. Track trends, identify patterns, and use data-driven insights to improve patient care and outcomes.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-xl font-bold">
                    4
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <Phone className="h-6 w-6 text-green-600" />
                    <h3 className="text-2xl font-semibold text-gray-900">Communicate Effectively</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Initiate secure voice calls with patients directly through the platform. Access call transcripts, generate summaries with AI assistance, and maintain comprehensive patient communication records.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join TeddyBridge today and experience the power of peer support and data-driven healthcare.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup/patient">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto">
                Sign Up as Patient
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/signup/doctor">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Sign Up as Doctor
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 pt-16 pb-8 border-t border-gray-200 bg-white">
        <div className="max-w-screen-xl mx-auto px-6 lg:px-12">
          <div className="flex flex-col lg:flex-row lg:justify-between items-start lg:items-center gap-8">
            {/* Left side */}
            <div className="flex flex-col">
              <div className="mb-4">
                <Logo size="lg" />
              </div>
              <p className="text-sm text-gray-600 mb-1">
                Brought to you by CareBridge AI.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                © 2025 TeddyBridge. All rights reserved.
              </p>
            </div>
            
            {/* Right side - Navigation and Sign Up */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <Link href="/how-it-works" className="text-sm text-gray-600 hover:text-gray-900">
                  How it works
                </Link>
                <Link href="/terms" className="text-sm text-gray-600 hover:text-gray-900">
                  Terms
                </Link>
                <Link href="/contact" className="text-sm text-gray-600 hover:text-gray-900">
                  Contact
                </Link>
                <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
                  Login
                </Link>
              </div>
              <Link href="/">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-6 py-2 text-sm font-medium">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}


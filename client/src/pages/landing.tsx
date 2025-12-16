import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
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
  CheckCircle,
  LogIn,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      {/* Header - Matching salespatriot.com design - Transparent */}
      <header className="absolute top-0 left-0 right-0 z-50 w-full border-b border-transparent bg-transparent" style={{ backgroundColor: 'transparent' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link href="/">
              <Logo size="md" bridgeColor="text-white" />
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-3">
              <Link href="/patient">
                <Button variant="ghost" className="text-white hover:bg-white/10 text-sm lg:text-base" data-testid="link-patient">
                  Patient
                </Button>
              </Link>
              <Link href="/doctor">
                <Button variant="ghost" className="text-white hover:bg-white/10 text-sm lg:text-base" data-testid="link-doctor">
                  Doctor
                </Button>
              </Link>
              <Link href="/about">
                <Button variant="ghost" className="text-white hover:bg-white/10 text-sm lg:text-base" data-testid="link-about">
                  About Us
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" className="text-white bg-white/20 hover:bg-white/30 flex items-center gap-2 text-sm lg:text-base" data-testid="link-login">
                  <LogIn className="h-4 w-4" />
                  <span className="hidden lg:inline">Log In</span>
                  <span className="lg:hidden">Login</span>
                </Button>
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              className="md:hidden text-white hover:bg-white/10 p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>

          {/* Mobile Navigation Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden absolute top-16 left-0 right-0 bg-[#1a1a1a]/95 backdrop-blur-md border-b border-white/10">
              <nav className="flex flex-col py-4 px-4 space-y-2">
                <Link href="/patient" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10" data-testid="link-patient-mobile">
                    Patient
                  </Button>
                </Link>
                <Link href="/doctor" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10" data-testid="link-doctor-mobile">
                    Doctor
                  </Button>
                </Link>
                <Link href="/about" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10" data-testid="link-about-mobile">
                    About Us
                  </Button>
                </Link>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start text-white bg-white/20 hover:bg-white/30" data-testid="link-login-mobile">
                    <LogIn className="h-4 w-4 mr-2" />
                    Log In
                  </Button>
                </Link>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section - Matching salespatriot.com design */}
      <section className="relative h-screen flex flex-col justify-center items-center">
        {/* Background Container */}
        <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
          {/* Video Background */}
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ zIndex: 0, opacity: 0.7 }}
          >
            <source src="/hero-video.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Gradient Background */}
          <div 
            className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-black"
            style={{ 
              background: 'linear-gradient(135deg, rgb(26, 26, 26) 0%, rgb(45, 45, 45) 50%, rgb(26, 26, 26) 100%)',
              opacity: 0.3,
              zIndex: 1
            }}
          />
          
          {/* Vertical Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-transparent" />
          
          {/* Radial Gradient Overlay */}
          <div 
            className="absolute inset-0"
            style={{ background: 'radial-gradient(rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 40%, transparent 70%)' }}
          />
          
          {/* Horizontal Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-black/15" />
        </div>
        
        {/* Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-[2] flex-1 flex items-center pt-20 sm:pt-0">
          <div className="text-center w-full">
            <div className="mx-auto max-w-[980px] px-4 sm:px-6 text-center">
              {/* Made in America Badge */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 group mx-auto flex w-fit items-center gap-2 rounded-full p-1 pl-3 pr-3 sm:pl-4 sm:pr-4 text-white mb-4 sm:mb-6">
                <span className="text-xs sm:text-sm font-medium">Made in America</span>
                <span className="text-lg sm:text-xl">🇺🇸</span>
              </div>
              
              {/* Tagline */}
              <h1 className="text-white font-extrabold tracking-tight leading-[1.1] sm:leading-[1.05] drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] text-[clamp(28px,8vw,68px)] sm:text-[clamp(40px,5.2vw,56px)] xl:text-[clamp(48px,6vw,68px)] px-2">
                Connect with Peers
              </h1>
              
              {/* Description */}
              <p className="mt-4 sm:mt-5 text-white/85 font-medium leading-relaxed text-[clamp(14px,2vw,20px)] max-w-2xl mx-auto mb-6 sm:mb-10 px-4">
                TeddyBridge connects patients for <span className="font-semibold text-white underline decoration-white/30 underline-offset-[6px]">Peer-to-Peer Support</span> and enables doctors to monitor outcomes with PROMS — tracking.
              </p>
            
              {/* Two Glassmorphism Cards */}
              <div className="flex justify-center px-4">
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 justify-center w-full sm:w-auto max-w-2xl sm:max-w-none">
              {/* Patient Card */}
              <Link href="/signup/patient" className="w-full sm:w-auto sm:flex-1">
                <div className="group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 sm:p-6 md:p-8 hover:bg-white/15 transition-all duration-300 cursor-pointer w-full sm:min-w-[280px] md:min-w-[320px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 flex-shrink-0">
                        <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-1">
                          I&apos;m a Patient
                        </h3>
                        <p className="text-xs sm:text-sm text-white/80 font-normal">
                          Connect with peers
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </div>
              </Link>

              {/* Doctor Card */}
              <Link href="/signup/doctor" className="w-full sm:w-auto sm:flex-1">
                <div className="group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 sm:p-6 md:p-8 hover:bg-white/15 transition-all duration-300 cursor-pointer w-full sm:min-w-[280px] md:min-w-[320px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 flex-shrink-0">
                        <Stethoscope className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-1">
                          I&apos;m a Doctor
                        </h3>
                        <p className="text-xs sm:text-sm text-white/80 font-normal">
                          Track patient outcomes
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </div>
              </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By Section - Matching salespatriot style */}
      <section className="py-12 sm:py-16 md:py-20 bg-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-white mb-2 sm:mb-3 px-4">
            Trusted By Leading Healthcare Providers
          </h2>
          <p className="text-white/80 text-xs sm:text-sm md:text-base mb-8 sm:mb-12 px-4">
            Proudly serving patients and doctors across the healthcare ecosystem.
          </p>
          
          {/* Trust badges */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8 lg:gap-12">
            <div className="flex items-center gap-2 text-white/90">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">HIPAA Compliant</span>
            </div>
            <div className="flex items-center gap-2 text-white/90">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Powered by CareBridge AI</span>
            </div>
            <div className="flex items-center gap-2 text-white/90">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Secure & Encrypted</span>
            </div>
          </div>
        </div>
      </section>


      {/* Footer - Dark theme */}
      <footer className="py-6 sm:py-8 border-t border-white/10 bg-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3 sm:gap-4">
            <Logo size="sm" bridgeColor="text-white" />
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-xs text-white/70">
              <span>Powered by CareBridge AI</span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4 text-green-400 flex-shrink-0" />
                HIPAA Compliant
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

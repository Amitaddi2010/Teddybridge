import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { 
  Heart,
  Stethoscope,
  Users,
  ArrowRight,
  Shield,
  LogIn,
  Menu,
  X
} from "lucide-react";

export default function About() {
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
                <Link href="/about" className="block duration-150 transition-colors text-gray-700 hover:text-gray-900 font-medium">
                  <span>About</span>
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

      {/* Why We're Building TeddyBridge Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-8">
              Why We&apos;re Building TeddyBridge
            </h2>
            
            <div className="flex items-center gap-3 mb-8">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            
            <div className="space-y-6 text-lg text-gray-700 leading-relaxed">
              <p>
                At TeddyBridge, we are more than a software platform—we carry forward a mission of compassion, connection, and care. Our founders have witnessed firsthand the transformative power of peer support in healthcare recovery journeys.
              </p>
              <p>
                Through our expertise in healthcare technology, AI, and patient-centered design, we honor the legacy of those who have dedicated their lives to healing and helping others. We believe that no one should face their recovery journey alone, and that healthcare providers deserve the best tools to track and improve patient outcomes.
              </p>
              <p>
                By connecting patients with peers who understand their experiences and empowering doctors with advanced PROMS analytics, we contribute to a modern healthcare ecosystem where support, data, and compassion work together to improve lives.
              </p>
            </div>

            {/* Healthcare Images Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <Users className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-700">Patient Support</p>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <Stethoscope className="h-16 w-16 text-green-600 mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-700">Healthcare Providers</p>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <Heart className="h-16 w-16 text-purple-600 mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-700">Recovery Journey</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Join Our Mission Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Join Our Mission
          </h2>
          <p className="text-lg text-gray-700 mb-8 leading-relaxed">
            We&apos;re a small team and we&apos;re looking for people who are passionate about our mission and who are willing to roll up their sleeves and get things done.
          </p>
          <Link href="/contact">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white">
              View Open Positions
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
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

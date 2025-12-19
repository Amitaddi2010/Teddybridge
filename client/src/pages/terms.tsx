import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { 
  LogIn,
  Menu,
  X
} from "lucide-react";

export default function Terms() {
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
                <Link href="/how-it-works" className="block duration-150 transition-colors text-gray-700 hover:text-gray-900">
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
                    className="block px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
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

      {/* Content Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Terms of Service
            </h1>
            <p className="text-sm text-gray-600">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="prose prose-lg max-w-none space-y-8 text-gray-700">
            {/* Introduction */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="leading-relaxed">
                Welcome to TeddyBridge. These Terms of Service ("Terms") govern your access to and use of the TeddyBridge platform, including our website, mobile applications, and services (collectively, the "Service"). By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access the Service.
              </p>
            </section>

            {/* Acceptance */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Acceptance of Terms</h2>
              <p className="leading-relaxed">
                By creating an account, accessing, or using TeddyBridge, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. These Terms apply to all users of the Service, including patients, doctors, healthcare providers, and visitors.
              </p>
            </section>

            {/* Description of Service */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Description of Service</h2>
              <p className="leading-relaxed mb-4">
                TeddyBridge is a healthcare technology platform that provides:
              </p>
              <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                <li>Peer-to-peer connection services for patients with similar healthcare experiences</li>
                <li>Patient-Reported Outcome Measures (PROMS) survey management and analytics for healthcare providers</li>
                <li>Secure communication tools including voice calls and messaging</li>
                <li>Healthcare data tracking and reporting features</li>
              </ul>
            </section>

            {/* User Accounts */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. User Accounts</h2>
              <p className="leading-relaxed mb-4">
                To use certain features of the Service, you must register for an account. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                <li>Provide accurate, current, and complete information during registration</li>
                <li>Maintain and promptly update your account information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activities that occur under your account</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>
            </section>

            {/* User Responsibilities */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. User Responsibilities</h2>
              <p className="leading-relaxed mb-4">
                You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                <li>Use the Service in any way that violates applicable laws or regulations</li>
                <li>Impersonate any person or entity or falsely state or misrepresent your affiliation</li>
                <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                <li>Attempt to gain unauthorized access to any portion of the Service</li>
                <li>Collect or store personal data about other users without their consent</li>
                <li>Use the Service to transmit any harmful, offensive, or inappropriate content</li>
                <li>Violate any intellectual property rights or privacy rights</li>
              </ul>
            </section>

            {/* Medical Disclaimer */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Medical Disclaimer</h2>
              <p className="leading-relaxed mb-4">
                <strong className="text-gray-900">IMPORTANT:</strong> TeddyBridge is not a medical service provider. The Service is designed to facilitate peer support and healthcare data management but does not provide medical advice, diagnosis, or treatment.
              </p>
              <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                <li>The information and content provided through the Service are for informational purposes only</li>
                <li>Peer connections and communications do not constitute medical advice</li>
                <li>Always seek the advice of qualified healthcare providers regarding any medical condition</li>
                <li>Never disregard professional medical advice or delay seeking it because of information from the Service</li>
                <li>In case of a medical emergency, contact emergency services immediately</li>
              </ul>
            </section>

            {/* HIPAA Compliance */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. HIPAA Compliance and Privacy</h2>
              <p className="leading-relaxed mb-4">
                We are committed to protecting your health information in accordance with the Health Insurance Portability and Accountability Act (HIPAA) and other applicable privacy laws. Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, and protect your information.
              </p>
              <p className="leading-relaxed">
                Healthcare providers using the Service are responsible for ensuring their use complies with HIPAA and other applicable healthcare privacy regulations.
              </p>
            </section>

            {/* Intellectual Property */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Intellectual Property</h2>
              <p className="leading-relaxed mb-4">
                The Service and its original content, features, and functionality are owned by TeddyBridge and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not reproduce, distribute, modify, or create derivative works of the Service without our prior written consent.
              </p>
            </section>

            {/* Limitation of Liability */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Limitation of Liability</h2>
              <p className="leading-relaxed mb-4">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, TEDDYBRIDGE AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE.
              </p>
            </section>

            {/* Termination */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Termination</h2>
              <p className="leading-relaxed mb-4">
                We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will cease immediately.
              </p>
            </section>

            {/* Changes to Terms */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Changes to Terms</h2>
              <p className="leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of any material changes by posting the new Terms on this page and updating the "Last updated" date. Your continued use of the Service after such changes constitutes acceptance of the new Terms.
              </p>
            </section>

            {/* Contact Information */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Contact Information</h2>
              <p className="leading-relaxed">
                If you have any questions about these Terms, please contact us at{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  our contact page
                </Link>.
              </p>
            </section>
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


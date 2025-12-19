import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/logo";
import { 
  LogIn,
  Menu,
  X,
  Mail,
  MessageSquare,
  Send,
  MapPin,
  Phone,
  Clock
} from "lucide-react";

export default function Contact() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    // Simulate form submission (replace with actual API call)
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setSubmitStatus("idle");
      }, 5000);
    }, 1000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

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

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              Get in Touch
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Send us a Message</h2>
              
              {submitStatus === "success" && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800">Thank you for your message! We'll get back to you soon.</p>
                </div>
              )}

              {submitStatus === "error" && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800">Something went wrong. Please try again later.</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Name
                  </label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                    Subject
                  </label>
                  <Input
                    id="subject"
                    name="subject"
                    type="text"
                    required
                    value={formData.subject}
                    onChange={handleChange}
                    className="w-full"
                    placeholder="What's this about?"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Message
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    required
                    value={formData.message}
                    onChange={handleChange}
                    rows={6}
                    className="w-full"
                    placeholder="Your message..."
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>Sending...</>
                  ) : (
                    <>
                      Send Message
                      <Send className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Contact Information */}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Contact Information</h2>
              
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
                    <p className="text-gray-600">
                      <a href="mailto:support@teddybridge.com" className="hover:text-primary transition-colors">
                        support@teddybridge.com
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <MessageSquare className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">General Inquiries</h3>
                    <p className="text-gray-600">
                      For general questions, partnership opportunities, or media inquiries
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Response Time</h3>
                    <p className="text-gray-600">
                      We typically respond within 1-2 business days. For urgent matters, please mark your message as urgent.
                    </p>
                  </div>
                </div>

                <div className="pt-8 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4">Other Ways to Reach Us</h3>
                  <ul className="space-y-3 text-sm text-gray-600">
                    <li>
                      <strong className="text-gray-900">Support:</strong> For technical issues or account help, use the email above or contact support through your dashboard.
                    </li>
                    <li>
                      <strong className="text-gray-900">Sales:</strong> Interested in enterprise solutions? Reach out to discuss custom pricing and features.
                    </li>
                    <li>
                      <strong className="text-gray-900">Partnerships:</strong> Healthcare providers and organizations interested in integrating TeddyBridge can contact us for partnership opportunities.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
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


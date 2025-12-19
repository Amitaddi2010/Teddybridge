import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { AnimatedConnectingLines } from "@/components/animated-connecting-lines";
import { 
  Users, 
  Search,
  ClipboardCheck,
  Send,
  ArrowRight,
  CheckCircle,
  Shield,
  Activity,
  Phone,
  QrCode,
  FileText,
  Download,
  Target,
  Mail,
  Database,
  Zap,
  TrendingUp,
  DollarSign,
  Package,
  Clock,
  Circle,
  LogIn,
  Menu,
  X
} from "lucide-react";

export default function DoctorPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const promsSectionRef = useRef<HTMLElement>(null);
  const intelligenceSectionRef = useRef<HTMLElement>(null);
  const patientManagementSectionRef = useRef<HTMLElement>(null);
  const reportsSectionRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const setupObserver = () => {
      const animatedElements = document.querySelectorAll('.animate-on-scroll');
      
      animatedElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100;
        
        if (isInViewport) {
          element.classList.add("visible");
        } else {
          observer.observe(element);
        }
      });
    };

    // Run after a brief delay to ensure DOM is ready
    const timeoutId = setTimeout(setupObserver, 50);
    
    // Also run immediately
    setupObserver();

    // Fallback: show all elements after 1 second if they're still hidden
    const fallbackTimeout = setTimeout(() => {
      const hiddenElements = document.querySelectorAll('.animate-on-scroll:not(.visible)');
      hiddenElements.forEach((element) => {
        element.classList.add("visible");
      });
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(fallbackTimeout);
      observer.disconnect();
    };
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

      {/* Hero Section - Exact SalesPatriot style */}
      <main className="overflow-visible">
        <section className="overflow-visible">
          <div className="relative pt-15 lg:pt-30 pb-40 lg:pb-60 overflow-hidden">
            <div className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]"></div>
            {/* White gradient overlay from bottom */}
            <div 
              className="absolute bottom-0 left-0 right-0 h-[80%] z-[1] pointer-events-none opacity-100"
              style={{
                background: "linear-gradient(to top, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 20%, rgba(255, 255, 255, 0.4) 40%, rgba(255, 255, 255, 0.25) 60%, rgba(255, 255, 255, 0.1) 80%, transparent 100%)"
              }}
            ></div>
            <div className="mx-auto max-w-7xl px-6 pt-8 lg:px-12 relative">
              <div className="grid lg:grid-cols-[45fr_55fr] gap-8 lg:gap-12 items-start">
                {/* Left Content */}
                <div className="text-center sm:mx-auto lg:mx-0 lg:text-left relative z-10">
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6">
                    <span style={{ fontSize: "12px" }}>🏥</span>
                    <span className="text-sm font-medium">For Doctors</span>
                  </div>
                  <h1 className="mt-3 max-w-2xl mx-auto lg:mx-0 text-balance sm:text-5xl text-4xl font-medium lg:text-6xl xl:text-6xl lg:mt-6 tracking-tight text-gray-900">
                    Track Patient Outcomes with Advanced PROMS Analytics
                  </h1>
                  <p className="mt-8 max-w-2xl mx-auto lg:mx-0 text-pretty text-sm sm:text-base lg:text-lg text-gray-600">
                    We help doctors find, review, and track more PROMS. <br className="hidden lg:block" />
                    One platform to unify your entire workflow.
                  </p>
                  <div className="mt-12 flex justify-center lg:justify-start items-center gap-3">
                    <Link href="/signup/doctor">
                      <Button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all shadow-xs has-[>svg]:px-4 h-[42px] rounded-xl px-5 text-sm sm:text-base bg-gray-900 hover:bg-gray-800 text-white">
                        <span className="flex items-center gap-2 text-nowrap">Sign Up as Doctor</span>
                      </Button>
                    </Link>
                    <Link href="/login">
                      <Button variant="outline" className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all shadow-xs has-[>svg]:px-4 h-[42px] rounded-xl px-5 text-sm sm:text-base border-gray-300 hover:bg-gray-50">
                        <span className="flex items-center gap-2 text-nowrap">Log In</span>
                      </Button>
                    </Link>
                  </div>
                </div>
                
                {/* Right - 3D Table - SalesPatriot Style */}
                <div className="relative hidden lg:block mt-12 lg:mt-10 lg:absolute lg:right-0 lg:top-32 lg:w-[58%] xl:w-[60%] xl:translate-x-20 ">
                  <div className="relative w-full">
                    <div 
                      className="bg-background rounded-2xl border border-gray-200 p-[15px] shadow-lg shadow-zinc-950/15 ring-1 ring-background overflow-hidden"
                      style={{
                        transform: "perspective(1500px) rotateY(-12deg) rotateX(8deg) translateZ(0)",
                        transformStyle: "preserve-3d",
                        transformOrigin: "bottom left",
                        transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                        boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "perspective(1500px) rotateY(-10deg) rotateX(6deg) translateZ(20px) scale(1.01)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "perspective(1500px) rotateY(-12deg) rotateX(8deg) translateZ(0)";
                      }}
                    >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">PROM ID</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Survey Type</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Response Rate</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Verified</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Linked Patients</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Responses</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Status</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Created</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">Due Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {[
                          { id: "PROM-2025-001", surveyType: "Pre-Op Assessment", responseRate: "87%", verified: true, linkedPatients: "24", responses: "21", status: "Active", created: "Jan 20, 2025", dueDate: "Feb 20, 2025" },
                          { id: "PROM-2025-002", surveyType: "Post-Op Survey", responseRate: "92%", verified: true, linkedPatients: "18", responses: "17", status: "Active", created: "Jan 19, 2025", dueDate: "Feb 19, 2025" },
                          { id: "PROM-2025-003", surveyType: "Follow-Up Check", responseRate: "75%", verified: true, linkedPatients: "12", responses: "9", status: "Pending", created: "Jan 18, 2025", dueDate: "Feb 18, 2025" },
                          { id: "PROM-2025-004", surveyType: "Pre-Op Evaluation", responseRate: "100%", verified: true, linkedPatients: "8", responses: "8", status: "Completed", created: "Jan 17, 2025", dueDate: "Feb 17, 2025" },
                          { id: "PROM-2025-005", surveyType: "Post-Op Monitoring", responseRate: "83%", verified: true, linkedPatients: "30", responses: "25", status: "Active", created: "Jan 16, 2025", dueDate: "Feb 16, 2025" },
                          { id: "PROM-2025-006", surveyType: "Follow-Up Survey", responseRate: "67%", verified: false, linkedPatients: "15", responses: "10", status: "Pending", created: "Jan 15, 2025", dueDate: "Feb 15, 2025" },
                          { id: "PROM-2025-007", surveyType: "Post-Op Assessment", responseRate: "95%", verified: true, linkedPatients: "20", responses: "19", status: "Completed", created: "Jan 14, 2025", dueDate: "Feb 14, 2025" },
                          { id: "PROM-2025-008", surveyType: "Pre-Op Survey", responseRate: "79%", verified: true, linkedPatients: "14", responses: "11", status: "Active", created: "Jan 13, 2025", dueDate: "Feb 13, 2025" },
                          { id: "PROM-2025-009", surveyType: "Pain Assessment", responseRate: "88%", verified: true, linkedPatients: "22", responses: "19", status: "Active", created: "Jan 12, 2025", dueDate: "Feb 12, 2025" },
                          { id: "PROM-2025-010", surveyType: "Mobility Survey", responseRate: "91%", verified: true, linkedPatients: "16", responses: "15", status: "Active", created: "Jan 11, 2025", dueDate: "Feb 11, 2025" },
                          { id: "PROM-2025-011", surveyType: "Quality of Life", responseRate: "73%", verified: true, linkedPatients: "19", responses: "14", status: "Pending", created: "Jan 10, 2025", dueDate: "Feb 10, 2025" },
                          { id: "PROM-2025-012", surveyType: "Functional Assessment", responseRate: "85%", verified: true, linkedPatients: "26", responses: "22", status: "Active", created: "Jan 9, 2025", dueDate: "Feb 9, 2025" },
                          { id: "PROM-2025-013", surveyType: "Satisfaction Survey", responseRate: "94%", verified: true, linkedPatients: "17", responses: "16", status: "Completed", created: "Jan 8, 2025", dueDate: "Feb 8, 2025" },
                          { id: "PROM-2025-014", surveyType: "Recovery Progress", responseRate: "81%", verified: true, linkedPatients: "28", responses: "23", status: "Active", created: "Jan 7, 2025", dueDate: "Feb 7, 2025" },
                          { id: "PROM-2025-015", surveyType: "Symptom Tracking", responseRate: "69%", verified: false, linkedPatients: "13", responses: "9", status: "Pending", created: "Jan 6, 2025", dueDate: "Feb 6, 2025" },
                          { id: "PROM-2025-016", surveyType: "Medication Review", responseRate: "96%", verified: true, linkedPatients: "25", responses: "24", status: "Active", created: "Jan 5, 2025", dueDate: "Feb 5, 2025" },
                          { id: "PROM-2025-017", surveyType: "Complication Check", responseRate: "77%", verified: true, linkedPatients: "21", responses: "16", status: "Active", created: "Jan 4, 2025", dueDate: "Feb 4, 2025" },
                          { id: "PROM-2025-018", surveyType: "Activity Level", responseRate: "89%", verified: true, linkedPatients: "23", responses: "20", status: "Completed", created: "Jan 3, 2025", dueDate: "Feb 3, 2025" },
                          { id: "PROM-2025-019", surveyType: "Wellness Check", responseRate: "82%", verified: true, linkedPatients: "27", responses: "22", status: "Active", created: "Jan 2, 2025", dueDate: "Feb 2, 2025" },
                          { id: "PROM-2025-020", surveyType: "Outcome Measure", responseRate: "90%", verified: true, linkedPatients: "29", responses: "26", status: "Active", created: "Jan 1, 2025", dueDate: "Feb 1, 2025" },
                        ].map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2.5 text-blue-600 font-medium cursor-pointer hover:underline text-xs">{row.id}</td>
                            <td className="px-3 py-2.5 text-gray-900 text-xs">{row.surveyType}</td>
                            <td className="px-3 py-2.5 text-gray-700 font-medium text-xs">{row.responseRate}</td>
                            <td className="px-3 py-2.5 text-center">
                              {row.verified ? (
                                <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                              ) : (
                                <X className="h-4 w-4 text-gray-400 mx-auto" />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{row.linkedPatients}</td>
                            <td className="px-3 py-2.5 text-gray-700 text-xs">{row.responses}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                                row.status === "Active" ? "bg-green-100 text-green-700" :
                                row.status === "Completed" ? "bg-blue-100 text-blue-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{row.created}</td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{row.dueDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Mobile View */}
            <div className="relative block lg:hidden mt-8 px-4">
              <div 
                className="relative mx-auto max-w-sm rounded-2xl border p-2 shadow-lg shadow-zinc-950/15 bg-background"
                style={{
                  transform: "perspective(1000px) rotateY(-5deg) rotateX(2deg)",
                  transformStyle: "preserve-3d"
                }}
              >
                <img 
                  className="w-full h-auto rounded-xl" 
                  alt="TeddyBridge platform dashboard" 
                  width="2700" 
                  height="1440" 
                  src="/images/doctor-dashboard.svg"
                  style={{
                    transform: "translateZ(20px)",
                    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)"
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Section - Exact SalesPatriot style */}
        <section className="relative py-10 bg-white lg:pt-30 lg:pb-30 overflow-hidden">
          <div className="relative mx-auto max-w-6xl px-6 lg:px-12">
            <div className="space-y-16">
              <div className="grid grid-cols-1 lg:grid-cols-[48fr_52fr] gap-8 lg:gap-16 items-start">
                <div>
                  <h2 className="mt-0 text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-5xl font-medium leading-[1.1] tracking-tight text-gray-900">
                    Streamline your doctor workflow
                  </h2>
                </div>
                <div className="max-w-4xl">
                  <p className="text-sm sm:text-base lg:text-lg text-gray-600 leading-relaxed">
                    Leading doctors process hundreds of PROMS every month. TeddyBridge's AI speeds up your workflow 7-10x accelerating the process of finding, reviewing, and tracking PROMS.
                  </p>
                </div>
              </div>

              {/* Workflow Cards - Exact SalesPatriot style */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 px-2 pb-2">
                {/* Find Card */}
                <div className="group relative aspect-[3/4] md:aspect-[4/5]">
                  <div className="absolute inset-0 rounded-2xl" style={{ 
                    background: "linear-gradient(135deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.03) 100%)", 
                    transform: "translateZ(-4px) translateX(2px) translateY(2px)", 
                    filter: "blur(4px)" 
                  }}></div>
                  <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ 
                    background: "linear-gradient(135deg, rgb(255, 255, 255) 0%, rgb(248, 250, 252) 25%, rgb(241, 245, 249) 50%, rgb(226, 232, 240) 75%, rgb(203, 213, 225) 100%)" 
                  }}>
                    <div className="relative h-[60%] flex items-center justify-center border-b border-gray-200/50 overflow-hidden" style={{ backgroundColor: "rgb(248, 248, 248)" }}>
                      <div className="relative w-full h-full max-w-[200px] max-h-[200px] rounded-full bg-gray-50 overflow-hidden aspect-square">
                        {/* Radar circles */}
                        {[16.67, 33.34, 50.01, 66.68, 83.35, 100.02].map((size, idx) => (
                          <div 
                            key={idx}
                            className="absolute border border-gray-400 rounded-full"
                            style={{
                              width: `${size}%`,
                              height: `${size}%`,
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%)",
                              opacity: 1 - (idx * 0.15),
                              maskImage: "radial-gradient(circle, black 85%, transparent 100%)"
                            }}
                          />
                        ))}
                        {/* Radar sweep */}
                        <div 
                          className="absolute pointer-events-none rounded-full animate-radar-sweep"
                          style={{
                            width: "100%",
                            height: "100%",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            transformOrigin: "center center",
                            background: "conic-gradient(from -60deg, transparent 0deg, rgba(34, 197, 94, 0.08) 20deg, rgba(34, 197, 94, 0.08) 100deg, transparent 120deg)",
                            maskImage: "radial-gradient(circle, black 85%, transparent 100%)",
                            clipPath: "circle(50% at 50% 50%)"
                          }}
                        />
                        {/* Blips */}
                        {[
                          { left: "calc(50% + 27.31px)", top: "calc(50% - 4.76px)", delay: "0.89s", label: "PROMS" },
                          { left: "calc(50% + 59.18px)", top: "calc(50% + 56.28px)", delay: "1.48s", label: "PATIENTS" },
                          { left: "calc(50% + 8.91px)", top: "calc(50% + 78.58px)", delay: "1.93s", label: "SURVEYS" },
                        ].map((blip, idx) => (
                          <div 
                            key={idx}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2"
                            style={{ left: blip.left, top: blip.top, opacity: 1 }}
                          >
                            <div 
                              className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-blip-pulse"
                              style={{ animationDelay: blip.delay }}
                            />
                            <div 
                              className="absolute bottom-full left-1/2 pointer-events-none animate-subtle-tooltip"
                              style={{ transform: "translateX(-50%) translateY(-0.5rem)", animationDelay: blip.delay }}
                            >
                              <div className="bg-gray-50 text-gray-500 text-[9px] px-1 py-0.5 rounded whitespace-nowrap shadow-sm border border-gray-100">
                                {blip.label}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-gray-600 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                      </div>
                    </div>
                    <div className="relative h-[40%] px-4 py-3 flex flex-col justify-center bg-white">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Find</h3>
                      </div>
                      <div className="text-gray-700 text-xs sm:text-sm leading-snug">
                        Automatically discover and assign PROMS across your patient network
                      </div>
                    </div>
                  </div>
                </div>

                {/* Review Card */}
                <div 
                  className="group relative aspect-[3/4] md:aspect-[4/5]"
                  style={{
                    transform: "perspective(1000px) rotateY(-2deg) rotateX(1deg)",
                    transformStyle: "preserve-3d",
                    transition: "transform 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg) scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "perspective(1000px) rotateY(-2deg) rotateX(1deg)";
                  }}
                >
                  <div className="absolute inset-0 rounded-2xl" style={{ 
                    background: "linear-gradient(135deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.03) 100%)", 
                    transform: "translateZ(-4px) translateX(2px) translateY(2px)", 
                    filter: "blur(4px)" 
                  }}></div>
                  <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ 
                    background: "linear-gradient(135deg, rgb(255, 255, 255) 0%, rgb(248, 250, 252) 25%, rgb(241, 245, 249) 50%, rgb(226, 232, 240) 75%, rgb(203, 213, 225) 100%)",
                    transform: "translateZ(0px)"
                  }}>
                    <div className="relative h-[60%] flex items-center justify-center border-b border-gray-200/50 overflow-hidden" style={{ backgroundColor: "rgb(248, 248, 248)" }}>
                      <div className="flex flex-col h-full w-full gap-5" style={{ 
                        transform: "translateY(0%)",
                        animation: "marqueeVertical 25s linear infinite"
                      }}>
                        {[
                          { match: "87%", name: "Pre-Op Assessment", id: "PROM-2025-001" },
                          { match: "92%", name: "Post-Op Survey", id: "PROM-2025-002" },
                          { match: "75%", name: "Follow-Up Check", id: "PROM-2025-003" },
                          { match: "100%", name: "Pre-Op Evaluation", id: "PROM-2025-004" },
                          { match: "83%", name: "Post-Op Monitoring", id: "PROM-2025-005" },
                          { match: "67%", name: "Follow-Up Survey", id: "PROM-2025-006" },
                          { match: "95%", name: "Post-Op Assessment", id: "PROM-2025-007" },
                          { match: "79%", name: "Pre-Op Survey", id: "PROM-2025-008" },
                        ].map((item, idx) => (
                          <div 
                            key={idx}
                            className="group flex items-center gap-2 cursor-pointer rounded-md border border-border/40 bg-gradient-to-b from-background/80 to-muted/80 p-4 shadow-md transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-xl flex-shrink-0"
                          >
                            <div className="mr-2 flex-shrink-0">
                              <span className={`inline-block w-8 px-1 py-0.5 rounded text-xs font-medium text-center transition-colors duration-300 ${
                                parseFloat(item.match) >= 95 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                              }`}>
                                {item.match}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <p className="text-foreground/80 transition-colors group-hover:text-foreground text-sm font-medium">{item.name}</p>
                              <p className="text-foreground/60 transition-colors group-hover:text-foreground/80 text-xs font-mono">{item.id}</p>
                            </div>
                          </div>
                        ))}
                        {/* Duplicate for seamless loop */}
                        {[
                          { match: "87%", name: "Pre-Op Assessment", id: "PROM-2025-001" },
                          { match: "92%", name: "Post-Op Survey", id: "PROM-2025-002" },
                          { match: "75%", name: "Follow-Up Check", id: "PROM-2025-003" },
                          { match: "100%", name: "Pre-Op Evaluation", id: "PROM-2025-004" },
                          { match: "83%", name: "Post-Op Monitoring", id: "PROM-2025-005" },
                          { match: "67%", name: "Follow-Up Survey", id: "PROM-2025-006" },
                          { match: "95%", name: "Post-Op Assessment", id: "PROM-2025-007" },
                          { match: "79%", name: "Pre-Op Survey", id: "PROM-2025-008" },
                        ].map((item, idx) => (
                          <div 
                            key={`dup-${idx}`}
                            className="group flex items-center gap-2 cursor-pointer rounded-md border border-border/40 bg-gradient-to-b from-background/80 to-muted/80 p-4 shadow-md transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-xl flex-shrink-0"
                          >
                            <div className="mr-2 flex-shrink-0">
                              <span className={`inline-block w-8 px-1 py-0.5 rounded text-xs font-medium text-center transition-colors duration-300 ${
                                parseFloat(item.match) >= 95 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                              }`}>
                                {item.match}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <p className="text-foreground/80 transition-colors group-hover:text-foreground text-sm font-medium">{item.name}</p>
                              <p className="text-foreground/60 transition-colors group-hover:text-foreground/80 text-xs font-mono">{item.id}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="relative h-[40%] px-4 py-3 flex flex-col justify-center bg-white">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Review</h3>
                      </div>
                      <p className="text-gray-700 text-xs sm:text-sm leading-snug">
                        Track PROMS and automate patient communications with full integration
                      </p>
                    </div>
                  </div>
                </div>

                {/* Track Card */}
                <div 
                  className="group relative aspect-[3/4] md:aspect-[4/5]"
                  style={{
                    transform: "perspective(1000px) rotateY(-2deg) rotateX(1deg)",
                    transformStyle: "preserve-3d",
                    transition: "transform 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg) scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "perspective(1000px) rotateY(-2deg) rotateX(1deg)";
                  }}
                >
                  <div className="absolute inset-0 rounded-2xl" style={{ 
                    background: "linear-gradient(135deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.03) 100%)", 
                    transform: "translateZ(-4px) translateX(2px) translateY(2px)", 
                    filter: "blur(4px)" 
                  }}></div>
                  <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ 
                    background: "linear-gradient(135deg, rgb(255, 255, 255) 0%, rgb(248, 250, 252) 25%, rgb(241, 245, 249) 50%, rgb(226, 232, 240) 75%, rgb(203, 213, 225) 100%)",
                    transform: "translateZ(0px)"
                  }}>
                    <div className="relative h-[60%] flex items-center justify-center border-b border-gray-200/50 overflow-hidden" style={{ backgroundColor: "rgb(248, 248, 248)" }}>
                      <div className="relative w-full h-full">
                        <svg width="364" height="162" viewBox="0 0 364 162" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                          {/* Background path for reference */}
                          <path 
                            d="M14.0855 136.948H0.232361V160.063C0.232361 160.694 0.74349 161.205 1.374 161.205H362.626C363.257 161.205 363.768 160.694 363.768 160.063V7.83003L348.529 27.0623C347.95 27.7922 346.789 27.56 346.535 26.664L339.619 2.20515C339.48 1.71355 339.032 1.37415 338.521 1.37415H318.801C318.497 1.37415 318.205 1.4957 317.991 1.71181L304.477 15.3355C304.141 15.6747 303.629 15.7685 303.194 15.5706L287.369 8.36919C286.741 8.08353 286.005 8.41541 285.804 9.07504L273.515 49.3394C273.247 50.217 272.106 50.4361 271.532 49.72L258.467 33.4128C257.95 32.7675 256.94 32.8688 256.561 33.6039L254.652 37.3111C254.331 37.9336 253.531 38.1235 252.965 37.7113L246.205 32.7895C245.656 32.3893 244.88 32.5553 244.543 33.1454L234.518 50.6624C234.266 51.1036 233.752 51.3247 233.258 51.2048L221.849 48.4359C221.257 48.2922 220.657 48.6386 220.485 49.223L207.648 92.8413C207.549 93.1756 207.304 93.4466 206.981 93.5773L188.476 101.062C187.942 101.278 187.331 101.063 187.051 100.56L174.171 77.4757C173.727 76.6802 172.576 76.6994 172.159 77.5093L166.688 88.1313C166.556 88.3867 166.333 88.5831 166.063 88.6814L153.695 93.184C153.371 93.3019 153.118 93.5599 153.006 93.886L145.621 115.395C145.498 115.752 145.207 116.026 144.842 116.125L128.067 120.705C127.824 120.772 127.609 120.917 127.457 121.119L116.342 135.833C115.907 136.409 115.053 136.442 114.575 135.9L106.181 126.393C105.805 125.967 105.172 125.883 104.697 126.196L78.4636 143.499C78.0728 143.756 77.5642 143.749 77.1806 143.481L68.5088 137.415C68.1093 137.135 67.5765 137.14 67.1824 137.427L59.2748 143.185C59.0795 143.327 58.8443 143.404 58.6028 143.404H41.7142C41.4112 143.404 41.1206 143.283 40.9065 143.069L24.4179 126.561C23.9339 126.077 23.135 126.124 22.7121 126.663L14.9836 136.511C14.7672 136.787 14.4361 136.948 14.0855 136.948Z" 
                            fill="rgba(0, 0, 0, 0.02)"
                          />
                          {/* Animated progress path */}
                          <path 
                            d="M14.0855 136.948H0.232361V160.063C0.232361 160.694 0.74349 161.205 1.374 161.205H362.626C363.257 161.205 363.768 160.694 363.768 160.063V7.83003L348.529 27.0623C347.95 27.7922 346.789 27.56 346.535 26.664L339.619 2.20515C339.48 1.71355 339.032 1.37415 338.521 1.37415H318.801C318.497 1.37415 318.205 1.4957 317.991 1.71181L304.477 15.3355C304.141 15.6747 303.629 15.7685 303.194 15.5706L287.369 8.36919C286.741 8.08353 286.005 8.41541 285.804 9.07504L273.515 49.3394C273.247 50.217 272.106 50.4361 271.532 49.72L258.467 33.4128C257.95 32.7675 256.94 32.8688 256.561 33.6039L254.652 37.3111C254.331 37.9336 253.531 38.1235 252.965 37.7113L246.205 32.7895C245.656 32.3893 244.88 32.5553 244.543 33.1454L234.518 50.6624C234.266 51.1036 233.752 51.3247 233.258 51.2048L221.849 48.4359C221.257 48.2922 220.657 48.6386 220.485 49.223L207.648 92.8413C207.549 93.1756 207.304 93.4466 206.981 93.5773L188.476 101.062C187.942 101.278 187.331 101.063 187.051 100.56L174.171 77.4757C173.727 76.6802 172.576 76.6994 172.159 77.5093L166.688 88.1313C166.556 88.3867 166.333 88.5831 166.063 88.6814L153.695 93.184C153.371 93.3019 153.118 93.5599 153.006 93.886L145.621 115.395C145.498 115.752 145.207 116.026 144.842 116.125L128.067 120.705C127.824 120.772 127.609 120.917 127.457 121.119L116.342 135.833C115.907 136.409 115.053 136.442 114.575 135.9L106.181 126.393C105.805 125.967 105.172 125.883 104.697 126.196L78.4636 143.499C78.0728 143.756 77.5642 143.749 77.1806 143.481L68.5088 137.415C68.1093 137.135 67.5765 137.14 67.1824 137.427L59.2748 143.185C59.0795 143.327 58.8443 143.404 58.6028 143.404H41.7142C41.4112 143.404 41.1206 143.283 40.9065 143.069L24.4179 126.561C23.9339 126.077 23.135 126.124 22.7121 126.663L14.9836 136.511C14.7672 136.787 14.4361 136.948 14.0855 136.948Z" 
                            fill="url(#paint0_linear_0_947)" 
                            style={{
                              clipPath: "polygon(0 0, 0% 0, 0% 100%, 0 100%)",
                              animation: "trackProgress 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                            }}
                          />
                          <defs>
                            <linearGradient id="paint0_linear_0_947" x1="182" y1="1.37415" x2="182" y2="161.205" gradientUnits="userSpaceOnUse">
                              <stop stopColor="hsl(142, 71%, 45%)" />
                              <stop offset="0.5" stopColor="hsl(142, 65%, 50%)" />
                              <stop offset="1" stopColor="hsl(142, 60%, 55%)" stopOpacity="0.8" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700" style={{ 
                          fontFamily: "Inter, sans-serif", 
                          left: "75%", 
                          bottom: "80%", 
                          pointerEvents: "none", 
                          transform: "translateY(-9.56px)", 
                          opacity: 1 
                        }}>
                          <CheckCircle className="w-3 h-3" />
                          PROM completed
                        </div>
                      </div>
                    </div>
                    <div className="relative h-[40%] px-6 py-5 flex flex-col justify-center bg-white">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Track</h3>
                      </div>
                      <p className="text-gray-700 text-xs sm:text-sm leading-relaxed">
                        Respond instantly to PROMS and track their status across all platforms
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trusted Partners Marquee */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-12">
            <div className="text-center">
              <div className="relative overflow-hidden">
                <div className="absolute left-0 top-0 w-12 md:w-24 h-full bg-gradient-to-r from-background to-transparent z-10 pointer-events-none"></div>
                <div className="absolute right-0 top-0 w-12 md:w-24 h-full bg-gradient-to-l from-background to-transparent z-10 pointer-events-none"></div>
                <div className="flex animate-marquee gap-12 md:gap-16 lg:gap-20">
                  {["Healthcare Systems", "Medical Centers", "Hospital Networks", "Health Partners", "Care Providers", "Medical Groups"].map((name, idx) => (
                    <div key={idx} className="flex items-center justify-center hover:opacity-100 transition-opacity duration-300 flex-shrink-0">
                      <div className="h-8 md:h-10 w-auto px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-medium text-sm">
                        {name}
                      </div>
                    </div>
                  ))}
                  {["Healthcare Systems", "Medical Centers", "Hospital Networks", "Health Partners", "Care Providers", "Medical Groups"].map((name, idx) => (
                    <div key={`dup-${idx}`} className="flex items-center justify-center hover:opacity-100 transition-opacity duration-300 flex-shrink-0">
                      <div className="h-8 md:h-10 w-auto px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-medium text-sm">
                        {name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROMS Section - Exact SalesPatriot style */}
        <section ref={promsSectionRef} className="relative -mt-6 rounded-3xl bg-white">
          <div className="absolute inset-0"></div>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full fill-stone-200/20 stroke-stone-200/20 rounded-3xl" style={{ 
            maskImage: "linear-gradient(transparent 0%, black 10%, black 90%, transparent 100%)" 
          }}>
            <defs>
              <pattern id="pattern-r3" width="60" height="60" patternUnits="userSpaceOnUse" x="-1" y="-1">
                <path d="M.5 60V.5H60" fill="none" strokeDasharray="0"></path>
              </pattern>
            </defs>
            <rect width="100%" height="100%" strokeWidth="0" fill="url(#pattern-r3)"></rect>
          </svg>
          <div className="mx-auto max-w-6xl px-6 lg:px-12">
            <div className="space-y-0">
              <div className="min-h-screen flex flex-col lg:flex-row -mb-16 md:-mb-32 lg:-mb-55">
                <div className="w-full lg:w-1/2 relative z-10 flex flex-col justify-center pt-12 pb-8 md:pt-6 md:pb-0 px-4 lg:px-0 animate-on-scroll fade-left">
                  <div className="flex w-fit items-center gap-2 transition-all duration-300 mb-6">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ 
                      background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                    }}>
                      <Search className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">PROMS</span>
                  </div>
                  <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-5xl font-medium leading-[1.1] tracking-tight text-gray-900 mb-4 lg:mb-8">
                    Find top PROMS<br /> across platforms
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-lg mb-4">
                    Monitor patient PROMS, surveys, and assessments in real time. Never miss another opportunity again.
                  </p>
                  <div className="space-y-4 mt-6">
                    {[
                      { icon: Target, text: "Identify inbound PROMS and flag relevant patients" },
                      { icon: Mail, text: "Match PROMS to your patient database using AI" },
                      { icon: Database, text: "Filter your PROMS by your patient criteria" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 animate-on-scroll fade-left" style={{ animationDelay: `${idx * 0.1}s` }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ 
                          background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                        }}>
                          <item.icon className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                        </div>
                        <span className="text-gray-700 text-xs sm:text-sm leading-relaxed">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-full lg:w-1/2 flex items-center justify-center p-1 sm:p-2 lg:p-8 min-h-[300px] mb-16 md:mb-8 lg:mb-0 lg:min-h-0 animate-on-scroll fade-right">
                  <div className="w-full h-full flex items-center justify-center scale-65 sm:scale-80 lg:scale-100">
                    <div className="w-full h-full flex flex-col items-center justify-center relative" style={{ minHeight: "400px" }}>
                      {/* Source labels at top - Marquee animation */}
                      <div className="relative w-full mb-6 overflow-hidden" style={{ height: "32px" }}>
                            <div 
                          className="flex items-center gap-8 animate-marquee"
                              style={{ 
                            fontFamily: "Inter, sans-serif",
                            whiteSpace: "nowrap",
                            width: "fit-content"
                              }}
                            >
                          {/* First set of labels */}
                          {["EMR", "PATIENTS", "SURVEYS", "PROMS"].map((source, idx) => (
                              <span 
                              key={`first-${idx}`}
                              className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider inline-block"
                                style={{
                                  letterSpacing: "0.05em",
                                  fontWeight: 600
                                }}
                              >
                                {source}
                              </span>
                          ))}
                          {/* Duplicate set for seamless loop */}
                          {["EMR", "PATIENTS", "SURVEYS", "PROMS"].map((source, idx) => (
                            <span 
                              key={`second-${idx}`}
                              className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider inline-block"
                              style={{
                                letterSpacing: "0.05em",
                                fontWeight: 600
                              }}
                            >
                              {source}
                            </span>
                          ))}
                            </div>
                      </div>
                      
                      {/* Animated curved connecting lines with pulse effects */}
                      <AnimatedConnectingLines
                        labels={["EMR", "PATIENTS", "SURVEYS", "PROMS"]}
                        labelPositions={["15%", "35%", "55%", "75%"]}
                        targetPositions={["20%", "35%", "55%", "70%"]}
                        color="#3b82f6"
                        pathConfigs={[
                          { startX: "15%", startY: "0%", endX: "20%", endY: "100%", controlX: "17.5%", controlY: "50%" },
                          { startX: "35%", startY: "0%", endX: "35%", endY: "100%", controlX: "35%", controlY: "50%" },
                          { startX: "55%", startY: "0%", endX: "55%", endY: "100%", controlX: "55%", controlY: "50%" },
                          { startX: "75%", startY: "0%", endX: "70%", endY: "100%", controlX: "72.5%", controlY: "50%" },
                        ]}
                              />
                      
                      {/* Window box with table */}
                      <div className="table-container animate-on-scroll scale mt-20" style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "600px" }}>
                        <div className="bg-white border-2 rounded-lg shadow-lg overflow-hidden" style={{ borderRadius: "8px" }}>
                          {/* Window header with traffic lights */}
                          <div className="bg-gray-50 border-b px-4 py-2 flex items-center gap-2">
                            <div className="flex gap-1.5">
                              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            </div>
                            <div className="flex-1"></div>
                          </div>
                          
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                              {["ACTIVE PROMS", "PENDING", "COMPLETED", "ARCHIVED"].map((label, idx) => (
                                <div 
                                  key={idx}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200 animate-on-scroll fade-up ${
                                    idx === 0 
                                      ? "bg-blue-100 text-blue-700 border border-blue-200" 
                                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                  }`}
                                  style={{ 
                                    fontFamily: "Inter, sans-serif",
                                    animationDelay: `${idx * 0.05}s` 
                                  }}
                                >
                                  {label}
                                </div>
                              ))}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full" style={{ fontFamily: "Inter, sans-serif" }}>
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wide text-gray-600">PROM ID</th>
                                    <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wide text-gray-600">Patient</th>
                                    <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wide text-gray-600">Status</th>
                                    <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wide text-gray-600">Type</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    { id: "PROM-001", patient: "John D.", status: "Active", type: "PRE-OP" },
                                    { id: "PROM-002", patient: "Sarah M.", status: "Active", type: "POST-OP" },
                                    { id: "PROM-003", patient: "Mike R.", status: "Pending", type: "FOLLOW-UP" },
                                    { id: "PROM-004", patient: "Emily T.", status: "Completed", type: "PRE-OP" },
                                    { id: "PROM-005", patient: "David L.", status: "Active", type: "POST-OP" },
                                    { id: "PROM-006", patient: "Lisa K.", status: "Pending", type: "FOLLOW-UP" },
                                    { id: "PROM-007", patient: "Robert P.", status: "Completed", type: "POST-OP" },
                                  ].map((row, idx) => (
                                    <tr 
                                      key={idx}
                                      className="border-b border-gray-100 hover:bg-blue-50/50 transition-all duration-200 animate-fade-in-row"
                                      style={{ 
                                        animationDelay: `${idx * 0.08}s`,
                                        animationIterationCount: idx < 3 ? "1" : "1"
                                      }}
                                    >
                                      <td className="py-2.5 px-3 font-medium text-[11px] text-blue-600">{row.id}</td>
                                      <td className="py-2.5 px-3 text-[11px] text-gray-900">{row.patient}</td>
                                      <td className="py-2.5 px-3">
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                                          row.status === "Active" ? "bg-green-100 text-green-700" :
                                          row.status === "Completed" ? "bg-blue-100 text-blue-700" :
                                          "bg-yellow-100 text-yellow-700"
                                        }`}>
                                          {row.status}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-semibold text-gray-700">{row.type}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Intelligence Section - Exact SalesPatriot style */}
        <section ref={intelligenceSectionRef} className="relative -mt-6 rounded-3xl bg-white">
          <div className="mx-auto max-w-6xl px-6 lg:px-12">
            <div className="min-h-screen flex flex-col lg:flex-row -mb-16 md:-mb-32 lg:-mb-55">
              <div className="w-full lg:w-1/2 relative z-10 flex flex-col justify-center pt-12 pb-8 md:pt-6 md:pb-0 px-4 lg:px-0 animate-on-scroll fade-right">
                <div className="flex w-fit items-center gap-2 transition-all duration-300 mb-6">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ 
                    background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                  }}>
                    <ClipboardCheck className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Intelligence</span>
                </div>
                <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-5xl font-medium leading-[1.1] tracking-tight text-gray-900 mb-4 lg:mb-8">
                  Organize PROM details<br /> without opening files
                </h2>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-lg mb-4">
                  Eliminate time spent digging through files. Extract details and survey requests instantly, structuring them for fast review.
                </p>
                <div className="space-y-4 mt-6">
                  {[
                    { icon: Zap, text: "Standardize your PROMS using AI" },
                    { icon: Database, text: "Integrate with your EMR to show relevant patient data" },
                    { icon: Users, text: "See relevant patient profiles and active PROMS" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 animate-on-scroll fade-right" style={{ animationDelay: `${idx * 0.1}s` }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ 
                        background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                      }}>
                        <item.icon className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                      </div>
                      <span className="text-gray-700 text-xs sm:text-sm leading-relaxed">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full lg:w-1/2 flex items-center justify-center p-1 sm:p-2 lg:p-8 min-h-[300px] mb-16 md:mb-8 lg:mb-0 lg:min-h-0 animate-on-scroll fade-left">
                <div className="w-full h-full flex items-center justify-center scale-65 sm:scale-80 lg:scale-100">
                  <div className="bg-white border-2 rounded-lg shadow-lg w-full max-w-lg animate-on-scroll scale overflow-hidden transition-all duration-500 hover:shadow-xl" style={{ borderRadius: "12px" }}>
                    {/* Window controls */}
                    <div className="bg-gray-50 border-b px-4 py-2.5 flex items-center gap-2 animate-on-scroll fade-up">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-window-control cursor-pointer"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500 animate-window-control cursor-pointer"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500 animate-window-control cursor-pointer"></div>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      {/* Title and Status */}
                      <div className="flex items-center justify-between animate-on-scroll fade-up">
                        <h3 className="text-xl font-bold text-gray-900 transition-colors duration-300">PROM Survey (PROM-2025-001)</h3>
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium animate-status-badge">
                          Open
                        </span>
                      </div>
                      
                      {/* Three data boxes */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 animate-on-scroll fade-up animate-data-box" style={{ animationDelay: "0.1s" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <ClipboardCheck className="w-4 h-4 text-green-600 transition-transform duration-300 group-hover:scale-110" />
                            <span className="text-xs font-medium text-gray-600">Response Rate</span>
                          </div>
                          <p className="text-xl font-bold text-green-700 transition-all duration-300">87%</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-on-scroll fade-up animate-data-box" style={{ animationDelay: "0.15s" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="w-4 h-4 text-blue-600 transition-transform duration-300 group-hover:scale-110" />
                            <span className="text-xs font-medium text-gray-600">Linked Patients</span>
                          </div>
                          <p className="text-xl font-bold text-blue-700 transition-all duration-300">24</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-on-scroll fade-up animate-data-box" style={{ animationDelay: "0.2s" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-blue-600 transition-transform duration-300 group-hover:scale-110" />
                            <span className="text-xs font-medium text-gray-600">Days Active</span>
                          </div>
                          <p className="text-xl font-bold text-blue-700 transition-all duration-300">42</p>
                        </div>
                      </div>
                      
                      {/* Right side info */}
                      <div className="grid grid-cols-2 gap-4 text-sm animate-on-scroll fade-up" style={{ animationDelay: "0.25s" }}>
                        <div className="transition-all duration-300 hover:bg-gray-50 rounded p-2 -m-2">
                          <p className="text-gray-600 mb-1">Created:</p>
                          <p className="font-semibold text-gray-900 transition-colors duration-300">Jan 20, 2025</p>
                        </div>
                        <div className="transition-all duration-300 hover:bg-gray-50 rounded p-2 -m-2">
                          <p className="text-gray-600 mb-1">Due Date:</p>
                          <p className="font-semibold text-gray-900 transition-colors duration-300">Feb 15, 2025</p>
                        </div>
                        <div className="transition-all duration-300 hover:bg-gray-50 rounded p-2 -m-2">
                          <p className="text-gray-600 mb-1">Status:</p>
                          <p className="font-semibold text-green-700 transition-colors duration-300">Active</p>
                        </div>
                        <div className="transition-all duration-300 hover:bg-gray-50 rounded p-2 -m-2">
                          <p className="text-gray-600 mb-1">Type:</p>
                          <p className="font-semibold text-gray-900 transition-colors duration-300">Pre-Op</p>
                        </div>
                      </div>
                      
                      {/* Two columns */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        {/* Left: QUALIFIED PATIENTS */}
                        <div className="animate-on-scroll fade-up" style={{ animationDelay: "0.3s" }}>
                          <p className="text-xs font-semibold mb-3 text-gray-900 uppercase tracking-wide">QUALIFIED PATIENTS</p>
                          <div className="space-y-2">
                            {[
                              { name: "John Doe", verified: true, id: "JD001" },
                              { name: "Jane Smith", verified: true, id: "JS002" },
                              { name: "Bob Johnson", verified: true, id: "BJ003" },
                            ].map((patient, idx) => (
                              <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200 animate-on-scroll fade-up animate-peer-card" style={{ animationDelay: `${0.35 + idx * 0.05}s` }}>
                                <p className="font-medium text-sm text-gray-900 transition-colors duration-300">{patient.name}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-xs text-gray-600">ID: {patient.id}</p>
                                  {patient.verified && (
                                    <span className="text-xs text-green-600 font-medium transition-all duration-300">Verified</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Right: LIVE EMR DATA */}
                        <div className="animate-on-scroll fade-up" style={{ animationDelay: "0.4s" }}>
                          <div className="flex items-center gap-2 mb-3">
                            <Circle className="w-2 h-2 fill-green-500 text-green-500 animate-live-indicator" />
                            <p className="text-xs font-semibold text-gray-900 uppercase tracking-wide">LIVE EMR DATA</p>
                          </div>
                          <div className="space-y-2">
                            <div className="p-2 bg-gray-50 rounded border border-gray-200 transition-all duration-300 hover:bg-gray-100 hover:border-green-300">
                              <p className="text-xs text-gray-600 mb-1">Surveys Sent:</p>
                              <p className="text-sm font-semibold text-green-700 transition-all duration-300">24</p>
                            </div>
                            <div className="p-2 bg-gray-50 rounded border border-gray-200 transition-all duration-300 hover:bg-gray-100 hover:border-blue-300">
                              <p className="text-xs text-gray-600 mb-1">Completed:</p>
                              <p className="text-sm font-semibold text-blue-700 transition-all duration-300">21</p>
                            </div>
                            <div className="p-2 bg-gray-50 rounded border border-gray-200 transition-all duration-300 hover:bg-gray-100 hover:border-yellow-300">
                              <p className="text-xs text-gray-600 mb-1">Pending:</p>
                              <p className="text-sm font-semibold text-yellow-700 transition-all duration-300">3</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Patient Management Section */}
        <section ref={patientManagementSectionRef} className="relative -mt-6 rounded-3xl bg-white">
          <div className="mx-auto max-w-6xl px-6 lg:px-12">
            <div className="min-h-screen flex flex-col lg:flex-row -mb-16 md:-mb-32 lg:-mb-55">
              <div className="w-full lg:w-1/2 relative z-10 flex flex-col justify-center pt-12 pb-8 md:pt-6 md:pb-0 px-4 lg:px-0 animate-on-scroll fade-left">
                <div className="flex w-fit items-center gap-2 transition-all duration-300 mb-6">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ 
                    background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                  }}>
                    <Target className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Patient Management</span>
                </div>
                <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-5xl font-medium leading-[1.1] tracking-tight text-gray-900 mb-4 lg:mb-8">
                  Review patients with<br /> lightning efficiency
                </h2>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-lg mb-4">
                  Organize and track patients from discovery to completion with intuitive workflows that keep you aligned.
                </p>
                <div className="space-y-4 mt-6">
                  {[
                    { icon: Target, text: "Move patients seamlessly through your patient board" },
                    { icon: Mail, text: "Sync with notifications to notify you as you complete tasks" },
                    { icon: Database, text: "Build a custom workflow to fit your specific needs" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 animate-on-scroll fade-left" style={{ animationDelay: `${idx * 0.1}s` }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ 
                        background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                      }}>
                        <item.icon className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                      </div>
                      <span className="text-gray-700 text-xs sm:text-sm leading-relaxed">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full lg:w-1/2 flex items-center justify-center p-1 sm:p-2 lg:p-8 min-h-[300px] mb-16 md:mb-8 lg:mb-0 lg:min-h-0 animate-on-scroll fade-right">
                <div className="w-full h-full flex items-center justify-center scale-65 sm:scale-80 lg:scale-100">
                  <div className="w-full h-full flex items-center justify-center mt-18">
                    <div className="bg-white border-2 rounded-lg p-6 w-full max-w-md animate-on-scroll scale">
                      <p className="text-sm text-gray-600 mb-4 animate-on-scroll fade-up">Patient Board Preview</p>
                      <div className="space-y-2">
                        {["New Patients", "In Progress", "Completed"].map((status, idx) => (
                          <div key={idx} className="p-3 bg-gray-50 rounded border border-gray-200 animate-on-scroll fade-up hover:bg-gray-100 hover:shadow-md transition-all duration-300" style={{ animationDelay: `${idx * 0.1}s` }}>
                            <p className="text-sm font-medium text-gray-900">{status}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Reports Section */}
        <section ref={reportsSectionRef} className="relative -mt-6 rounded-3xl bg-white pb-5">
          <div className="mx-auto max-w-6xl px-6 lg:px-12">
            <div className="min-h-screen flex flex-col lg:flex-row pb-5">
              <div className="w-full lg:w-1/2 relative z-10 flex flex-col justify-center pt-12 pb-8 md:pt-6 md:pb-0 px-4 lg:px-0 animate-on-scroll fade-right">
                <div className="flex w-fit items-center gap-2 transition-all duration-300 mb-6">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ 
                    background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                  }}>
                    <Activity className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Reports</span>
                </div>
                <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-5xl font-medium leading-[1.1] tracking-tight text-gray-900 mb-4 lg:mb-8">
                  Track all PROMS and performance metrics
                </h2>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-lg mb-4">
                  Monitor PROMS you're waiting on, have completed, or archived. Get alerted when similar opportunities reappear in the future.
                </p>
                <div className="space-y-4 mt-6">
                  {[
                    { icon: Target, text: "Track PROMS across all stages: waiting, completed, and archived" },
                    { icon: Database, text: "Flag archived PROMS when similar opportunities reappear" },
                    { icon: Activity, text: "Analyze completion rates and performance metrics over time" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 animate-on-scroll fade-right" style={{ animationDelay: `${idx * 0.1}s` }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ 
                        background: "linear-gradient(135deg, rgb(224, 242, 254) 0%, rgb(240, 249, 255) 100%)" 
                      }}>
                        <item.icon className="w-3 h-3" style={{ color: "rgb(3, 105, 161)" }} />
                      </div>
                      <span className="text-gray-700 text-xs sm:text-sm leading-relaxed">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full lg:w-1/2 flex items-center justify-center p-1 sm:p-2 lg:p-8 min-h-[400px] sm:min-h-[450px] pb-5 md:pb-24 mb-16 md:mb-8 lg:mb-0 lg:min-h-0 animate-on-scroll fade-left">
                <div className="w-full h-full flex items-center justify-center scale-65 sm:scale-75 lg:scale-90">
                  <div className="mt-26 w-full">
                    <div className="bg-white border-2 rounded-lg p-6 animate-on-scroll scale">
                      <div className="flex items-center justify-between mb-6 animate-on-scroll fade-up">
                        <h3 className="text-lg font-semibold text-gray-900">PROMS</h3>
                        <div className="flex gap-2">
                          {["completed", "waiting", "archived"].map((label, idx) => (
                            <span key={idx} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium animate-on-scroll fade-up" style={{ 
                              animationDelay: `${idx * 0.05}s`,
                              backgroundColor: label === "completed" ? "rgb(220 252 231)" : "rgb(243 244 246)",
                              color: label === "completed" ? "rgb(22 101 52)" : "rgb(75 85 99)"
                            }}>
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {[
                          { id: "PROM-001", date: "7/4/2025", status: "Completed", type: "Pre-Op" },
                          { id: "PROM-002", date: "7/2/2025", status: "Completed", type: "Post-Op" },
                          { id: "PROM-003", date: "7/2/2025", status: "Pending", type: "Follow-Up" },
                          { id: "PROM-004", date: "7/1/2025", status: "Completed", type: "Pre-Op" },
                        ].map((item, idx) => (
                          <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:shadow-md hover:bg-gray-100 transition-all duration-300 animate-on-scroll slide-in-table" style={{ animationDelay: `${idx * 0.1}s` }}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-sm text-gray-900">{item.id}</p>
                                <p className="text-xs text-gray-600">{item.date}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-sm text-gray-900">{item.type}</p>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  item.status === "Completed" ? "bg-green-100 text-green-700" :
                                  "bg-yellow-100 text-yellow-700"
                                }`}>
                                  {item.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

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
              <Link href="/signup/doctor">
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

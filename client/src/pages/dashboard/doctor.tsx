import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatsCard } from "@/components/stats-card";
import { PromsTable } from "@/components/proms-table";
import { DoctorQrCard } from "@/components/doctor-qr-card";
import { CallView } from "@/components/call-view";
import { EditDoctorProfileDialog } from "@/components/edit-doctor-profile-dialog";
import { SurveyAnalytics } from "@/components/survey-analytics";
import { SurveyResponseViewer } from "@/components/survey-response-viewer";
import { TeddyAssistant } from "@/components/teddy-assistant";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Phone,
  PhoneOff,
  Settings,
  LogOut,
  QrCode,
  Send,
  UserPlus,
  Edit,
  Download,
  FileText,
  Copy,
  RefreshCw,
  Check,
  AlertCircle,
  XCircle,
  Search,
  Filter,
} from "lucide-react";
import type { SurveyRequest, User, DoctorProfile, LinkRecord } from "@shared/schema";

type DoctorWithProfile = User & { doctorProfile?: DoctorProfile | null };
type SurveyWithPatient = SurveyRequest & { patient?: User | null };

export default function DoctorDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [activeCall, setActiveCall] = useState<{ 
    participantName: string; 
    transcript?: string;
    aiSummary?: string;
    callId?: string;
  } | null>(null);
  const [editProfileDialogOpen, setEditProfileDialogOpen] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyWithPatient & { responseData?: any } | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [callConfirmDialogOpen, setCallConfirmDialogOpen] = useState(false);
  const [selectedDoctorForCall, setSelectedDoctorForCall] = useState<DoctorWithProfile | null>(null);
  const [summaryConfirmDialogOpen, setSummaryConfirmDialogOpen] = useState(false);
  const [selectedCallForSummary, setSelectedCallForSummary] = useState<{ id: string; calleeName?: string } | null>(null);
  const [endCallConfirmDialogOpen, setEndCallConfirmDialogOpen] = useState(false);
  const [clearStaleCallsDialogOpen, setClearStaleCallsDialogOpen] = useState(false);
  const [summaryErrorDialogOpen, setSummaryErrorDialogOpen] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  
  // Search and filter state for available doctors
  const [doctorSearchQuery, setDoctorSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [doctorsPage, setDoctorsPage] = useState(1);
  const doctorsPerPage = 5;

  const { data: surveys, isLoading: loadingSurveys } = useQuery<SurveyWithPatient[]>({
    queryKey: ["/api/doctor/surveys"],
    refetchInterval: 30000, // Poll every 30 seconds for survey updates
  });

  // Fetch surveys with response data
  const { data: surveysWithData } = useQuery<(SurveyWithPatient & { responseData?: any })[]>({
    queryKey: ["/api/doctor/surveys/with-data"],
    enabled: !!user,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Fetch analytics for selected patient
  const { data: patientAnalytics } = useQuery({
    queryKey: ["/api/doctor/patient", selectedPatientId, "proms-analytics"],
    enabled: !!selectedPatientId,
  });

  const { data: linkedPatients, isLoading: loadingPatients } = useQuery<(LinkRecord & { patient?: { id: string; name: string; email: string; patientProfile?: any } })[]>({
    queryKey: ["/api/doctor/linked-patients"],
  });

  const { data: qrCode } = useQuery<{ qrCodeUrl: string; linkUrl: string }>({
    queryKey: ["/api/qr/my-code"],
  });

  const { data: doctors } = useQuery<DoctorWithProfile[]>({
    queryKey: ["/api/doctor/available"],
  });

  // Fetch call history with pagination
  const [callHistoryPage, setCallHistoryPage] = useState(1);
  const { data: callHistoryData, isLoading: loadingCallHistory } = useQuery({
    queryKey: ["/api/doctor/calls", callHistoryPage],
    queryFn: async () => {
      const response = await fetch(`/api/doctor/calls?page=${callHistoryPage}&limit=5`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch call history");
      return response.json();
    },
    enabled: !!user && activeTab === "calls",
    refetchInterval: (query) => {
      // Refetch more frequently (2 seconds) if there's an active call, otherwise 5 seconds
      // This ensures Twilio status changes are reflected quickly
      const hasActiveCall = query.state.data?.calls?.some((call: any) => call.isLive && !call.endedAt);
      return hasActiveCall ? 2000 : 5000;
    },
  });

  // Fetch recent calls for "Recent Calls" section (first page with more results)
  const { data: recentCallsData } = useQuery({
    queryKey: ["/api/doctor/calls", "recent"],
    queryFn: async () => {
      const response = await fetch(`/api/doctor/calls?page=1&limit=20`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch recent calls");
      return response.json();
    },
    enabled: !!user && (activeTab === "calls" || activeTab === "dashboard"),
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const callHistory = callHistoryData?.calls || [];
  const recentCalls = recentCallsData?.calls || [];
  const pagination = callHistoryData?.pagination;

  // Calculate call frequency for each doctor
  const doctorCallFrequency = useMemo(() => {
    const frequency: Record<string, number> = {};
    callHistory.forEach((call: any) => {
      const otherDoctorId = call.callerDoctorId === user?.id ? call.calleeDoctorId : call.callerDoctorId;
      if (otherDoctorId) {
        frequency[otherDoctorId] = (frequency[otherDoctorId] || 0) + 1;
      }
    });
    return frequency;
  }, [callHistory, user?.id]);

  // Filter and sort doctors
  const filteredAndSortedDoctors = useMemo(() => {
    if (!doctors) return [];
    
    let filtered = doctors.filter(d => d.id !== user?.id);
    
    // Apply search filter
    if (doctorSearchQuery.trim()) {
      const query = doctorSearchQuery.toLowerCase();
      filtered = filtered.filter(doctor => 
        doctor.name.toLowerCase().includes(query) ||
        doctor.email?.toLowerCase().includes(query) ||
        doctor.doctorProfile?.specialty?.toLowerCase().includes(query) ||
        doctor.doctorProfile?.city?.toLowerCase().includes(query)
      );
    }
    
    // Apply specialty filter
    if (selectedSpecialty !== "all") {
      filtered = filtered.filter(doctor => 
        doctor.doctorProfile?.specialty === selectedSpecialty
      );
    }
    
    // Sort by call frequency (most frequently used first), then by name
    filtered.sort((a, b) => {
      const aFreq = doctorCallFrequency[a.id] || 0;
      const bFreq = doctorCallFrequency[b.id] || 0;
      if (bFreq !== aFreq) {
        return bFreq - aFreq;
      }
      return a.name.localeCompare(b.name);
    });
    
    return filtered;
  }, [doctors, user?.id, doctorSearchQuery, selectedSpecialty, doctorCallFrequency]);

  // Get unique specialties for filter dropdown
  const specialties = useMemo(() => {
    if (!doctors) return [];
    const specialtySet = new Set<string>();
    doctors.forEach(doctor => {
      if (doctor.doctorProfile?.specialty) {
        specialtySet.add(doctor.doctorProfile.specialty);
      }
    });
    return Array.from(specialtySet).sort();
  }, [doctors]);

  // Paginate doctors
  const paginatedDoctors = useMemo(() => {
    const startIndex = (doctorsPage - 1) * doctorsPerPage;
    return filteredAndSortedDoctors.slice(startIndex, startIndex + doctorsPerPage);
  }, [filteredAndSortedDoctors, doctorsPage, doctorsPerPage]);

  const totalDoctorsPages = Math.ceil(filteredAndSortedDoctors.length / doctorsPerPage);

  // Extract recent doctors from call history for quick connect
  const recentDoctors = useMemo(() => {
    if (!recentCalls || recentCalls.length === 0) return [];
    
    // Get unique doctors from recent calls (last 10 calls)
    const topRecentCalls = recentCalls.slice(0, 10);
    const doctorMap = new Map<string, { doctor: DoctorWithProfile; lastCallDate: Date; callCount: number }>();
    
    topRecentCalls.forEach((call: any) => {
      const otherDoctor = call.callerDoctorId === user?.id ? call.callee : call.caller;
      const otherDoctorId = call.callerDoctorId === user?.id ? call.calleeDoctorId : call.callerDoctorId;
      
      if (otherDoctor && otherDoctorId && otherDoctorId !== user?.id) {
        const existing = doctorMap.get(otherDoctorId);
        const callDate = call.startedAt ? new Date(call.startedAt) : new Date();
        
        if (!existing || callDate > existing.lastCallDate) {
          // Find the full doctor object from the doctors list
          const fullDoctor = doctors?.find(d => d.id === otherDoctorId);
          if (fullDoctor) {
            doctorMap.set(otherDoctorId, {
              doctor: fullDoctor,
              lastCallDate: callDate,
              callCount: (existing?.callCount || 0) + 1
            });
          }
        } else {
          existing.callCount += 1;
        }
      }
    });
    
    // Convert to array and sort by most recent call
    return Array.from(doctorMap.values())
      .sort((a, b) => b.lastCallDate.getTime() - a.lastCallDate.getTime())
      .slice(0, 5) // Show only top 5 recent doctors
      .map(item => item.doctor);
  }, [recentCalls, doctors, user?.id]);

  // Fetch total completed calls count (fetch all calls to count completed ones)
  const { data: totalCompletedCalls } = useQuery({
    queryKey: ["/api/doctor/calls", "completed-count"],
    queryFn: async () => {
      const response = await fetch(`/api/doctor/calls?page=1&limit=1000`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch completed calls");
      const data = await response.json();
      // Count completed calls (ended and not live)
      return data.calls?.filter((call: any) => call.endedAt && !call.isLive).length || 0;
    },
    enabled: !!user && activeTab === "dashboard",
  });

  const { refreshUser } = useAuth();
  
  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      name?: string;
      phoneNumber?: string;
      specialty?: string;
      city?: string;
      education?: string;
      experience?: string;
      institution?: string;
      languages?: string;
      shortBio?: string;
      linkedinUrl?: string;
    }) => {
      return apiRequest("PUT", "/api/user/profile", data);
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setEditProfileDialogOpen(false);
      toast({
        title: "Profile updated!",
        description: "Your profile has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update profile",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const generateQrMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/qr/create", {});
    },
    onSuccess: async () => {
      // Invalidate and refetch the QR code, then open dialog
      await queryClient.refetchQueries({ queryKey: ["/api/qr/my-code"] });
      setQrCodeDialogOpen(true);
      toast({
        title: "QR Code generated!",
        description: "Patients can now scan to link with you.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate QR code",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const sendSurveyMutation = useMutation({
    mutationFn: async ({ patientId, type }: { patientId: string; type: "preop" | "postop" }) => {
      return apiRequest("POST", "/api/redcap/survey/send", { patientId, when: type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/surveys"] });
      toast({
        title: "Survey sent!",
        description: "The patient will receive an email with the survey link.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to send survey",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const [currentCallId, setCurrentCallId] = useState<string | null>(null);

  const initiateCallMutation = useMutation({
    mutationFn: async (calleeDoctorId: string) => {
      // Prevent initiating a new call if one is already active
      if (activeCall) {
        throw new Error("You are already in a call. Please end the current call first.");
      }
      return apiRequest("POST", "/api/twilio/call", { calleeDoctorId });
    },
    onSuccess: (callData, calleeDoctorId) => {
      const callee = doctors?.find(d => d.id === calleeDoctorId);
      console.log("Call initiated successfully, callData:", callData);
      setCurrentCallId(callData.id);
      setActiveCall({ 
        participantName: callee?.name || "Doctor",
        transcript: "",
        aiSummary: "",
        callId: callData.id,
      });
      toast({
        title: "Connecting call...",
        description: "You will receive a phone call shortly.",
      });
    },
    onError: async (error) => {
      let errorMessage = "Something went wrong";
      
      // Try to extract a user-friendly message from the error
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check if it's a service unavailable error (Twilio not configured)
        if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable") || errorMessage.includes("not configured")) {
          errorMessage = "Call service is not available. Please contact your administrator.";
        }
      }
      
      // If the error is about being in an active call, try to clear stale calls
      if (errorMessage.includes("already in an active call")) {
        try {
          await apiRequest("POST", "/api/doctor/calls/clear-stale", {});
          toast({
            title: "Cleared stale calls",
            description: "Stale call records have been cleared. Please try again.",
          });
          // Retry the call after a short delay
          setTimeout(() => {
            // The user can try again manually
          }, 1000);
        } catch (cleanupError) {
          console.error("Error clearing stale calls:", cleanupError);
        }
      } else {
      toast({
        title: "Failed to initiate call",
        description: errorMessage,
        variant: "destructive",
      });
      }
    },
  });

  const clearStaleCallsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/doctor/calls/clear-stale", {});
    },
    onSuccess: (data) => {
      setClearStaleCallsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/calls"] });
      toast({
        title: "Stale calls cleared",
        description: data.message || "Cleared stale call records.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear stale calls",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const endCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      return apiRequest("PUT", `/api/doctor/call/${callId}/end`, {});
    },
    onSuccess: () => {
      setActiveCall(null);
      setCurrentCallId(null);
      setEndCallConfirmDialogOpen(false);
      // Refresh call history to show the updated call with summary
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/calls"] });
      toast({
        title: "Call ended",
        description: "The call has been ended successfully.",
      });
    },
    onError: (error) => {
      // Even if the API call fails, clear the local state
      setActiveCall(null);
      setCurrentCallId(null);
      setEndCallConfirmDialogOpen(false);
      toast({
        title: "Call ended",
        description: "The call has been ended locally.",
        variant: "destructive",
      });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async ({ callId, recordingSid }: { callId: string; recordingSid?: string }) => {
      return apiRequest("POST", `/api/doctor/call/${callId}/process-recording`, { recordingSid });
    },
    onSuccess: () => {
      setSummaryConfirmDialogOpen(false);
      setSelectedCallForSummary(null);
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/calls"] });
      toast({
        title: "Summary generation started",
        description: "Your call summary is being generated. This may take a few minutes.",
      });
    },
    onError: (error) => {
      let errorMessage = "Something went wrong while generating the summary.";
      
      if (error instanceof Error) {
        // Extract user-friendly message from error
        const errorText = error.message;
        if (errorText.includes("Assembly AI API key not configured") || errorText.includes("ASSEMBLY_AI_API_KEY")) {
          errorMessage = "Summary generation service is not configured. Please contact your administrator to set up the transcription service.";
        } else if (errorText.includes("Groq API key not configured") || errorText.includes("GROQ_API_KEY")) {
          errorMessage = "AI summary service is not configured. Please contact your administrator to set up the AI summary service.";
        } else if (errorText.includes("Recording URL or RecordingSid is required")) {
          errorMessage = "No recording is available for this call. The call may not have been recorded, or the recording may not be ready yet. Please try again later or contact support if the issue persists.";
        } else if (errorText.includes("400") || errorText.includes("404")) {
          errorMessage = "Unable to process this call. The recording may not be available yet, or the call may have occurred before recording was enabled.";
        } else if (errorText.includes("500") || errorText.includes("503")) {
          errorMessage = "The summary service is temporarily unavailable. Please try again in a few moments.";
        } else {
          errorMessage = errorText;
        }
      }
      
      setSummaryError(errorMessage);
      setSummaryErrorDialogOpen(true);
      setSummaryConfirmDialogOpen(false);
    },
  });

  const pendingSurveys = surveys?.filter(s => s.status === "PENDING" || s.status === "SENT").length || 0;
  const completedSurveys = surveys?.filter(s => s.status === "COMPLETED").length || 0;
  
  // Calculate analytics
  const totalSurveys = surveys?.length || 0;
  const preopCount = surveys?.filter(s => s.when === "preop").length || 0;
  const postopCount = surveys?.filter(s => s.when === "postop").length || 0;
  const completionRate = totalSurveys > 0 ? (completedSurveys / totalSurveys) * 100 : 0;
  
  // Calculate average completion time
  const completedSurveysWithTime = surveys?.filter(s => 
    s.status === "COMPLETED" && s.completedAt && s.createdAt
  ) || [];
  const averageCompletionTime = completedSurveysWithTime.length > 0
    ? completedSurveysWithTime.reduce((sum, s) => {
        const created = new Date(s.createdAt).getTime();
        const completed = new Date(s.completedAt!).getTime();
        return sum + (completed - created);
      }, 0) / completedSurveysWithTime.length
    : null;

  // Poll for survey updates
  const pollSurveysMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/redcap/poll-surveys");
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      // Skip if REDCap is not configured (silent failure)
      if (data?.message === "REDCap API not configured") {
        return;
      }
      
      // Check if surveys were updated (updated is a number, details.updated is the array)
      const updatedCount = data?.updated || 0;
      const updatedIds = data?.details?.updated || [];
      
      // Invalidate and refetch queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/surveys/with-data"] });
      
      // Explicitly refetch to ensure UI updates immediately
      queryClient.refetchQueries({ queryKey: ["/api/doctor/surveys"] });
      queryClient.refetchQueries({ queryKey: ["/api/doctor/surveys/with-data"] });
      
      if (updatedCount > 0 && updatedIds.length > 0) {
        toast({
          title: "Surveys updated",
          description: `${updatedCount} survey(s) have been marked as completed.`,
        });
      }
    },
    onError: (error) => {
      // Silently handle polling errors to avoid spam
      // Don't log errors for REDCap not configured
      if (error instanceof Error && !error.message.includes("REDCap API not configured")) {
        console.debug("Survey polling error:", error);
      }
    },
  });

  // Auto-poll REDCap when surveys are loaded and there are pending ones
  // Use a ref to track if we've already polled to avoid repeated calls
  const hasPolledRef = useRef(false);
  useEffect(() => {
    if (surveys && surveys.some(s => s.status === "SENT" || s.status === "PENDING") && !hasPolledRef.current) {
      // Poll after a short delay to avoid too frequent calls
      const timer = setTimeout(() => {
        if (!pollSurveysMutation.isPending) {
          hasPolledRef.current = true;
          pollSurveysMutation.mutate();
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
    // Reset the ref when surveys change significantly (e.g., new surveys added)
    if (surveys && surveys.length > 0) {
      const pendingCount = surveys.filter(s => s.status === "SENT" || s.status === "PENDING").length;
      if (pendingCount === 0) {
        hasPolledRef.current = false;
      }
    }
  }, [surveys?.length, pollSurveysMutation]);

  // Download report
  const downloadReportMutation = useMutation({
    mutationFn: async ({ patientId, type }: { patientId: string; type?: "preop" | "postop" | "all" }) => {
      const url = `/api/doctor/patient/${patientId}/report?format=csv${type ? `&type=${type}` : ""}`;
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to download report");
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `patient-${patientId}-${type || 'all'}-surveys-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Report downloaded",
        description: "Survey report has been downloaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to download report",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });
  const totalPatients = linkedPatients?.length || 0;

  // Poll for call status updates to sync with Twilio
  useEffect(() => {
    if (!activeCall || !currentCallId) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await apiRequest("GET", `/api/doctor/calls?page=1&limit=1`, {});
        const calls = response.calls || [];
        const currentCall = calls.find((c: any) => c.id === currentCallId);
        
        // If call is no longer live or has ended, clear active call state
        if (currentCall && (!currentCall.isLive || currentCall.endedAt)) {
          setActiveCall(null);
          setCurrentCallId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/doctor/calls"] });
          toast({
            title: "Call ended",
            description: "The call has been disconnected.",
          });
        }
      } catch (error) {
        // Silently fail polling errors
        console.error("Error polling call status:", error);
      }
    }, 2000); // Poll every 2 seconds to sync with Twilio status quickly
    
    return () => clearInterval(pollInterval);
  }, [activeCall, currentCallId]);

  // Check if active call has ended and clear it automatically
  useEffect(() => {
    if (activeCall && currentCallId && callHistoryData?.calls) {
      const currentCall = callHistoryData.calls.find((call: any) => call.id === currentCallId);
      if (currentCall && currentCall.endedAt && !currentCall.isLive) {
        // Call has ended, clear active call state
        setActiveCall(null);
        setCurrentCallId(null);
        toast({
          title: "Call ended",
          description: "The call has been disconnected.",
        });
      }
    }
  }, [activeCall, currentCallId, callHistoryData]);

  const navItems = [
    { title: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
    { title: "Patients", icon: Users, id: "patients" },
    { title: "PROMS", icon: ClipboardCheck, id: "proms" },
    { title: "Calls", icon: Phone, id: "calls" },
    { title: "Settings", icon: Settings, id: "settings" },
  ];

  if (activeCall) {
    return (
      <>
      <CallView
        participantName={activeCall.participantName}
        isConnecting={initiateCallMutation.isPending}
        onEndCall={() => {
            console.log("onEndCall called, opening dialog");
            setEndCallConfirmDialogOpen(true);
            console.log("Dialog state set to true");
          }}
        />
        
        {/* End Call Confirmation Dialog - Must be rendered even when CallView is active */}
        <AlertDialog open={endCallConfirmDialogOpen} onOpenChange={(open) => {
          console.log("Dialog onOpenChange:", open);
          setEndCallConfirmDialogOpen(open);
        }}>
          <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden z-[100]">
            <div className="bg-gradient-to-br from-orange-50 via-red-50 to-amber-50 dark:from-orange-950/20 dark:via-red-950/20 dark:to-amber-950/20 p-6 pb-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <PhoneOff className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 pt-1">
                  <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                    End Call?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    Are you sure you want to end this call? The call will be terminated and a summary will be generated automatically.
                  </AlertDialogDescription>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-background">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {activeCall?.participantName || 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Active call in progress
                  </p>
                </div>
              </div>
            </div>

            <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
              <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1">
                Continue Call
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Try to get callId from multiple sources
                  let callId = currentCallId || activeCall?.callId;
                  
                  // If still not found, try to find it from call history (most recent live call)
                  if (!callId && callHistoryData?.calls) {
                    const liveCall = callHistoryData.calls.find((c: any) => c.isLive && !c.endedAt);
                    if (liveCall) {
                      callId = liveCall.id;
                      setCurrentCallId(liveCall.id);
                      console.log("Found callId from call history:", callId);
                    }
                  }
                  
                  console.log("End Call button clicked in dialog");
                  console.log("  currentCallId:", currentCallId);
                  console.log("  activeCall?.callId:", activeCall?.callId);
                  console.log("  callHistory live call:", callHistoryData?.calls?.find((c: any) => c.isLive && !c.endedAt)?.id);
                  console.log("  Using callId:", callId);
                  
                  if (callId) {
                    console.log("Calling endCallMutation with:", callId);
                    try {
                      const result = await endCallMutation.mutateAsync(callId);
                      console.log("Call ended successfully, result:", result);
                    } catch (error) {
                      console.error("Error ending call:", error);
                      // Still close dialog and clear state even on error
                      setEndCallConfirmDialogOpen(false);
                    }
          } else {
                    console.log("No callId found, clearing local state");
            setActiveCall(null);
            setCurrentCallId(null);
                    setEndCallConfirmDialogOpen(false);
          }
        }}
                className="w-full sm:w-auto order-1 sm:order-2 bg-orange-600 hover:bg-orange-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
                disabled={endCallMutation.isPending}
                type="button"
                autoFocus={false}
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                {endCallMutation.isPending ? "Ending..." : "End Call"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <>
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <Sidebar className="border-r">
          <SidebarContent className="gap-0">
            <SidebarGroup className="px-4 py-6 border-b">
                <Logo size="md" />
            </SidebarGroup>
            
            <SidebarGroup className="px-2 py-4">
              <SidebarGroupLabel className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Navigation
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => setActiveTab(item.id)}
                        isActive={activeTab === item.id}
                        data-testid={`nav-${item.id}`}
                        className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-sm"
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-auto px-2 py-4 border-t">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setLogoutDialogOpen(true)} 
                      data-testid="button-logout"
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                    >
                      <LogOut className="h-5 w-5" />
                      <span className="font-medium">Log Out</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-4">
              <SidebarTrigger 
                data-testid="button-sidebar-toggle"
                className="hover:bg-accent"
              />
              <div className="h-6 w-px bg-border" />
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
                {navItems.find(i => i.id === activeTab)?.title || "Dashboard"}
              </h1>
            </div>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto bg-background">
            {activeTab === "dashboard" && (
              <div className="space-y-0">
                {/* Hero Section - SalesPatriot Style */}
                <section className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-16 px-6">
                  <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                      <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">
                        Taking You from Opportunity to Outcome
                      </h1>
                      <p className="text-lg md:text-xl text-white/85 max-w-3xl">
                        We help doctors find, review, and track more PROMS. One platform to unify your entire patient monitoring workflow.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Stats Cards */}
                <section className="py-16 px-6 bg-background">
                  <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      <Card className="border-2">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Total Patients</p>
                              <p className="text-3xl font-bold">{totalPatients}</p>
                              <p className="text-xs text-muted-foreground mt-1">Linked via QR code</p>
                            </div>
                            <Users className="h-10 w-10 text-primary opacity-60" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-2">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Pending PROMS</p>
                              <p className="text-3xl font-bold">{pendingSurveys}</p>
                              <p className="text-xs text-muted-foreground mt-1">Awaiting completion</p>
                            </div>
                            <Send className="h-10 w-10 text-primary opacity-60" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-2">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Completed Surveys</p>
                              <p className="text-3xl font-bold">{completedSurveys}</p>
                              <p className="text-xs text-muted-foreground mt-1">Ready for review</p>
                            </div>
                            <ClipboardCheck className="h-10 w-10 text-primary opacity-60" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-2">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Total Completed Calls</p>
                              <p className="text-3xl font-bold">
                                {totalCompletedCalls ?? 0}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Doctor-to-doctor</p>
                            </div>
                            <Phone className="h-10 w-10 text-primary opacity-60" />
                          </div>
                        </CardContent>
                      </Card>
                </div>

                {/* Recent Calls Section */}
                {recentDoctors.length > 0 && (
                  <div className="mb-8">
                    <div className="mb-6">
                      <h2 className="text-2xl font-semibold mb-1.5 tracking-tight">Recent Calls</h2>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Quick connect with doctors you've called recently
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                      {recentDoctors.map(doctor => {
                        const callCount = doctorCallFrequency[doctor.id] || 0;
                        return (
                          <Card
                            key={doctor.id}
                            className="group relative border-2 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 hover:shadow-lg"
                          >
                            <CardContent className="p-5">
                              <div className="flex flex-col items-center gap-3">
                                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 flex items-center justify-center flex-shrink-0 ring-2 ring-gray-100 dark:ring-gray-800 group-hover:ring-blue-200 dark:group-hover:ring-blue-900/50 transition-all duration-300">
                                  <Users className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1 w-full text-center min-w-0">
                                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                                    {doctor.name}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                                    {doctor.doctorProfile?.specialty || "Healthcare Provider"}
                                  </p>
                                  {callCount > 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                      {callCount} {callCount === 1 ? 'call' : 'calls'}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  onClick={() => {
                                    setSelectedDoctorForCall(doctor);
                                    setCallConfirmDialogOpen(true);
                                  }}
                                  disabled={initiateCallMutation.isPending || !!activeCall}
                                  size="sm"
                                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                  <Phone className="h-4 w-4 mr-2" />
                                  Call
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                        <Card className="border-2">
                      <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div>
                              <CardTitle className="text-xl">PROMS Overview</CardTitle>
                          <CardDescription>
                            Patient-reported outcome measures tracking
                          </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("proms")}>
                          View All
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {loadingSurveys ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                              <Skeleton key={i} className="h-12" />
                            ))}
                          </div>
                        ) : (
                          <PromsTable
                            surveys={surveys?.slice(0, 5) || []}
                            onSendSurvey={(patientId, type) => 
                              sendSurveyMutation.mutate({ patientId, type })
                            }
                            isLoading={sendSurveyMutation.isPending}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div>
                    <DoctorQrCard
                      doctor={user as DoctorWithProfile}
                      qrCodeUrl={qrCode?.qrCodeUrl}
                      linkUrl={qrCode?.linkUrl}
                      onGenerateQr={() => generateQrMutation.mutate()}
                      onRefreshQr={() => generateQrMutation.mutate()}
                      isLoading={generateQrMutation.isPending}
                    />
                  </div>
                </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "patients" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Find top opportunities across your network</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Monitor linked patients in real time. Never miss another patient connection opportunity again.
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">Linked Patients</h2>
                    <p className="text-muted-foreground">
                      Patients who have scanned your QR code
                    </p>
                  </div>
                  <Button onClick={() => generateQrMutation.mutate()}>
                    <QrCode className="h-4 w-4 mr-2" />
                    Generate QR
                  </Button>
                </div>

                {loadingPatients ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-32" />
                    ))}
                  </div>
                ) : linkedPatients?.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <UserPlus className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <h3 className="font-semibold text-lg mb-2">No patients yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Generate a QR code and share it with your patients
                      </p>
                      <Button onClick={() => generateQrMutation.mutate()}>
                        <QrCode className="h-4 w-4 mr-2" />
                        Generate QR Code
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {linkedPatients?.map(record => {
                      const patient = record.patient;
                      return (
                        <Card key={record.id} className="hover-elevate">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Users className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {patient?.name || `Patient #${record.patientId.slice(0, 8)}`}
                                </p>
                                {patient?.email && (
                                  <p className="text-sm text-muted-foreground truncate">
                                    {patient.email}
                                  </p>
                                )}
                                {patient?.patientProfile?.phoneNumber && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {patient.patientProfile.phoneNumber}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Linked {new Date(record.linkedAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            {patient && (
                              <div className="mt-3 pt-3 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  onClick={() => {
                                    sendSurveyMutation.mutate({ 
                                      patientId: patient.id, 
                                      type: "preop" 
                                    });
                                  }}
                                  disabled={sendSurveyMutation.isPending}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  Send Survey
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "proms" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Organize PROMS details without opening PDFs</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Eliminate time spent digging through forms. Extract details and track outcomes from surveys, instantly structuring them for fast review.
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">PROMS Management</h2>
                    <p className="text-muted-foreground">
                      Send and track patient-reported outcome surveys
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pollSurveysMutation.mutate()}
                      disabled={pollSurveysMutation.isPending}
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Sync Surveys
                    </Button>
                    {linkedPatients && linkedPatients.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {linkedPatients.length} linked patient{linkedPatients.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* Analytics */}
                <SurveyAnalytics
                  totalSurveys={totalSurveys}
                  completedSurveys={completedSurveys}
                  pendingSurveys={pendingSurveys}
                  preopCount={preopCount}
                  postopCount={postopCount}
                  completionRate={completionRate}
                  averageCompletionTime={averageCompletionTime}
                />

                {/* Patient Analytics (if patient selected) */}
                {selectedPatientId && patientAnalytics && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Patient PROMS Analytics</CardTitle>
                      <CardDescription>
                        Detailed analytics for selected patient
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Surveys</p>
                          <p className="text-2xl font-bold">{patientAnalytics.totalSurveys}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Completed</p>
                          <p className="text-2xl font-bold">{patientAnalytics.completedSurveys}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Pre-Op</p>
                          <p className="text-2xl font-bold">{patientAnalytics.preopCount}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Post-Op</p>
                          <p className="text-2xl font-bold">{patientAnalytics.postopCount}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {loadingSurveys || loadingPatients ? (
                  <Skeleton className="h-64" />
                ) : (
                  <PromsTable
                    surveys={surveysWithData || surveys || []}
                    linkedPatients={linkedPatients?.map(r => ({
                      id: r.patient?.id || r.patientId,
                      name: r.patient?.name || "Unknown Patient",
                      email: r.patient?.email || "",
                      patientProfile: r.patient?.patientProfile,
                    })).filter(p => p.id) as User[] || []}
                    onSendSurvey={(patientId, type) => 
                      sendSurveyMutation.mutate({ patientId, type })
                    }
                    onViewResponse={(surveyId) => {
                      const survey = surveysWithData?.find(s => s.id === surveyId);
                      if (survey) {
                        setSelectedSurvey(survey);
                      }
                    }}
                    onGenerateReport={(patientId) => {
                      setSelectedPatientId(patientId);
                      downloadReportMutation.mutate({ patientId, type: "all" });
                    }}
                    isLoading={sendSurveyMutation.isPending}
                  />
                )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "calls" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Calls</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Connect with colleagues through secure, AI-powered voice calls
                    </p>
                  </div>
                </section>

                <section className="py-12 px-6 bg-gray-50/30 dark:bg-gray-950/30 min-h-full">
                  <div className="max-w-7xl mx-auto space-y-10">
                    {/* Recent Calls Section */}
                    {recentDoctors.length > 0 && (
                      <div>
                        <div className="mb-6">
                          <h2 className="text-2xl font-semibold mb-1.5 tracking-tight">Recent Calls</h2>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Quick connect with doctors you've called recently
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {recentDoctors.map(doctor => {
                            const callCount = doctorCallFrequency[doctor.id] || 0;
                            return (
                              <Card
                                key={doctor.id}
                                className="group relative border-2 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 hover:shadow-lg"
                              >
                                <CardContent className="p-5">
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 flex items-center justify-center flex-shrink-0 ring-2 ring-gray-100 dark:ring-gray-800">
                                        <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">
                                          {doctor.name}
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                          {doctor.doctorProfile?.specialty || "Healthcare Provider"}
                                        </p>
                                        {callCount > 0 && (
                                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                                            {callCount} {callCount === 1 ? 'call' : 'calls'}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      onClick={() => {
                                        setSelectedDoctorForCall(doctor);
                                        setCallConfirmDialogOpen(true);
                                      }}
                                      disabled={initiateCallMutation.isPending || !!activeCall}
                                      size="sm"
                                      className="rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-sm hover:shadow-md transition-all duration-200 flex-shrink-0"
                                    >
                                      <Phone className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Available Doctors Section */}
                  <div>
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-2xl font-semibold mb-1.5 tracking-tight">Available Doctors</h2>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Start a consultation with a colleague
                    </p>
                  </div>
                  <Button
                          onClick={() => setClearStaleCallsDialogOpen(true)}
                          variant="ghost"
                    size="sm"
                    disabled={clearStaleCallsMutation.isPending}
                          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    {clearStaleCallsMutation.isPending ? "Clearing..." : "Clear Stale Calls"}
                  </Button>
                </div>

                    {/* Search and Filter Controls */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Search doctors by name, email, specialty, or city..."
                          value={doctorSearchQuery}
                          onChange={(e) => {
                            setDoctorSearchQuery(e.target.value);
                            setDoctorsPage(1); // Reset to first page on search
                          }}
                          className="pl-10 rounded-xl border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80"
                        />
                      </div>
                      <Select
                        value={selectedSpecialty}
                        onValueChange={(value) => {
                          setSelectedSpecialty(value);
                          setDoctorsPage(1); // Reset to first page on filter change
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[200px] rounded-xl border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80">
                          <Filter className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="All Specialties" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Specialties</SelectItem>
                          {specialties.map(specialty => (
                            <SelectItem key={specialty} value={specialty}>
                              {specialty}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Results count */}
                    {filteredAndSortedDoctors.length > 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Showing {((doctorsPage - 1) * doctorsPerPage) + 1}-{Math.min(doctorsPage * doctorsPerPage, filteredAndSortedDoctors.length)} of {filteredAndSortedDoctors.length} doctor{filteredAndSortedDoctors.length !== 1 ? 's' : ''}
                        {Object.keys(doctorCallFrequency).length > 0 && (
                          <span className="ml-2 text-xs">
                            (sorted by most frequently used)
                          </span>
                        )}
                      </p>
                    )}

                    {filteredAndSortedDoctors.length === 0 ? (
                        <div className="py-20 text-center rounded-3xl bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50 shadow-sm">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                            <Users className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                          </div>
                          <h3 className="font-semibold text-lg mb-1.5 text-gray-900 dark:text-gray-100">No doctors available</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Other doctors will appear here when they join
                          </p>
                        </div>
                    ) : (
                        <>
                          <div className="grid gap-3">
                            {paginatedDoctors.map(doctor => {
                              const callCount = doctorCallFrequency[doctor.id] || 0;
                              return (
                                <div
                                  key={doctor.id}
                                  className="group relative flex items-center justify-between gap-6 p-5 rounded-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 transition-all duration-200 ease-out will-change-transform"
                                >
                                  <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="relative flex-shrink-0">
                                      <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 flex items-center justify-center ring-2 ring-gray-100 dark:ring-gray-800 group-hover:ring-blue-200 dark:group-hover:ring-blue-900/50 transition-all duration-300">
                                        <Users className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <p className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">
                                          {doctor.name}
                                        </p>
                                        {callCount > 0 && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                            {callCount} {callCount === 1 ? 'call' : 'calls'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-0.5">
                                        {doctor.doctorProfile?.specialty || "Healthcare Provider"}
                                      </p>
                                      {doctor.doctorProfile?.city && (
                                        <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1">
                                          <span>📍</span>
                                          {doctor.doctorProfile.city}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    onClick={() => {
                                      setSelectedDoctorForCall(doctor);
                                      setCallConfirmDialogOpen(true);
                                    }}
                                    disabled={initiateCallMutation.isPending || !!activeCall}
                                    data-testid={`button-call-doctor-${doctor.id}`}
                                    size="lg"
                                    className="rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 px-6 font-medium"
                                  >
                                    <Phone className="h-4 w-4 mr-2" />
                                    {activeCall ? "In Call" : "Call"}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Pagination */}
                          {totalDoctorsPages > 1 && (
                            <div className="flex items-center justify-center mt-6">
                              <Pagination>
                                <PaginationContent>
                                  <PaginationItem>
                                    <PaginationPrevious
                                      onClick={() => setDoctorsPage(p => Math.max(1, p - 1))}
                                      className={doctorsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                  </PaginationItem>
                                  {Array.from({ length: totalDoctorsPages }, (_, i) => i + 1).map(page => (
                                    <PaginationItem key={page}>
                                      <PaginationLink
                                        onClick={() => setDoctorsPage(page)}
                                        isActive={doctorsPage === page}
                                        className="cursor-pointer"
                                      >
                                        {page}
                                      </PaginationLink>
                                    </PaginationItem>
                                  ))}
                                  <PaginationItem>
                                    <PaginationNext
                                      onClick={() => setDoctorsPage(p => Math.min(totalDoctorsPages, p + 1))}
                                      className={doctorsPage === totalDoctorsPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                  </PaginationItem>
                                </PaginationContent>
                              </Pagination>
                            </div>
                          )}
                        </>
                    )}
                    </div>

                    {/* Call History Section */}
                    <div>
                      <div className="mb-6">
                        <h2 className="text-2xl font-semibold mb-1.5 tracking-tight">Call History</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                          Review past consultations and download transcripts
                        </p>
                      </div>

                    {loadingCallHistory ? (
                        <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-32 rounded-2xl" />
                        ))}
                      </div>
                    ) : callHistory && callHistory.length > 0 ? (
                      <div className="space-y-4">
                        {callHistory.map((call: any) => {
                          const otherDoctor = call.callerDoctorId === user?.id ? call.callee : call.caller;
                          const isCaller = call.callerDoctorId === user?.id;
                          const callDate = call.startedAt ? new Date(call.startedAt) : null;
                          const callDuration = call.startedAt && call.endedAt 
                            ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000 / 60)
                            : null;
                          
                          return (
                            <div
                              key={call.id}
                                className="group relative p-6 rounded-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 transition-all duration-200 ease-out will-change-transform"
                            >
                                <div className="flex items-start justify-between gap-4 mb-4">
                                  <div className="flex items-start gap-4 flex-1 min-w-0">
                                    <div className="flex-shrink-0">
                                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 flex items-center justify-center ring-2 ring-gray-100 dark:ring-gray-800">
                                        <Phone className="h-6 w-6 text-green-600 dark:text-green-400" />
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-base mb-1.5 text-gray-900 dark:text-gray-100">
                                      {isCaller ? "Called" : "Received call from"} {otherDoctor?.name || "Unknown Doctor"}
                                    </p>
                                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    {callDate && (
                                          <span className="flex items-center gap-1.5">
                                            <span>📅</span>
                                            {callDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            <span className="text-gray-400">at</span>
                                            {callDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                    )}
                                    {callDuration !== null && (
                                          <span className="flex items-center gap-1.5">
                                            <span>⏱️</span>
                                            {callDuration} {callDuration === 1 ? 'minute' : 'minutes'}
                                          </span>
                                    )}
                                    {call.isLive && !call.endedAt && (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium text-xs">
                                            <span className="relative flex h-2 w-2">
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                            Live
                                          </span>
                                    )}
                                        {call.endedAt && (
                                          <span className="text-gray-400 dark:text-gray-500">Completed</span>
                                    )}
                                      </div>
                                  </div>
                                </div>
                              </div>
                              
                              {call.summaryText && (
                                  <div className="mt-5 pt-5 border-t border-gray-200/60 dark:border-gray-800/60">
                                    {/* Download buttons */}
                                    {call.transcriptText && (
                                      <div className="flex gap-2 mb-4">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const url = `/api/doctor/call/${call.id}/download/pdf`;
                                          window.open(url, '_blank');
                                        }}
                                          className="rounded-xl border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 h-9 px-4 text-xs font-medium transition-all duration-200"
                                      >
                                          <Download className="h-3.5 w-3.5 mr-1.5" />
                                        PDF
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const url = `/api/doctor/call/${call.id}/download/doc`;
                                          window.open(url, '_blank');
                                        }}
                                          className="rounded-xl border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 h-9 px-4 text-xs font-medium transition-all duration-200"
                                      >
                                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                                        DOC
                                      </Button>
                                    </div>
                                    )}
                                    
                                    {/* Call Summary */}
                                    <details className="group">
                                      <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 list-none">
                                        <span className="select-none">Call Summary</span>
                                        <span className="text-gray-400 group-open:rotate-180 transition-transform duration-200">▼</span>
                                      </summary>
                                      <div className="mt-4 p-5 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                    {call.summaryText}
                                  </p>
                                      </div>
                                    </details>
                                    
                                    {/* Full Transcript */}
                                  {call.transcriptText && (
                                      <details className="group mt-4">
                                        <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 list-none">
                                          <span className="select-none">View Full Transcript</span>
                                          <span className="text-gray-400 group-open:rotate-180 transition-transform duration-200">▼</span>
                                      </summary>
                                        <div className="mt-4 p-5 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 max-h-96 overflow-y-auto">
                                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                          {call.transcriptText}
                                        </p>
                                      </div>
                                    </details>
                                  )}
                                    
                                    {/* TEMPORARY: Regenerate Summary button */}
                                    {call.transcriptText && (call.endedAt || !call.isLive) && (
                                      <div className="mt-4">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setSelectedCallForSummary({ 
                                              id: call.id, 
                                              calleeName: call.callee?.name || call.caller?.name || "Doctor" 
                                            });
                                            setSummaryConfirmDialogOpen(true);
                                          }}
                                          className="rounded-xl border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 h-8 px-3 text-xs font-medium transition-all duration-200"
                                          disabled={generateSummaryMutation.isPending}
                                          title="Temporary: Regenerate summary for testing"
                                        >
                                          <RefreshCw className={`h-3 w-3 mr-1.5 ${generateSummaryMutation.isPending && selectedCallForSummary?.id === call.id ? "animate-spin" : ""}`} />
                                          {generateSummaryMutation.isPending && selectedCallForSummary?.id === call.id ? "Regenerating..." : "Regenerate Summary"}
                                        </Button>
                                      </div>
                                  )}
                                </div>
                              )}
                              
                              {call.liveSummary && !call.summaryText && (
                                  <div className="mt-5 pt-5 border-t border-gray-200/60 dark:border-gray-800/60">
                                    <p className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Live Summary</p>
                                    <div className="p-5 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
                                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                    {call.liveSummary}
                                  </p>
                                    </div>
                                </div>
                              )}
                              
                                {/* Generate Summary button */}
                                {!call.transcriptText && (call.endedAt || !call.isLive) && (
                                  <div className="mt-5 pt-5 border-t border-gray-200/60 dark:border-gray-800/60">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                                      {call.summaryText && call.summaryText.includes("Call completed. Duration:") 
                                        ? "Basic summary available. Generate AI-powered summary with transcript and detailed insights."
                                        : "No summary available for this call."
                                      }
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                      onClick={() => {
                                        setSelectedCallForSummary({ 
                                          id: call.id, 
                                          calleeName: call.callee?.name || call.caller?.name || "Doctor" 
                                        });
                                        setSummaryConfirmDialogOpen(true);
                                      }}
                                      className="rounded-xl border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 h-9 px-4 text-xs font-medium transition-all duration-200"
                                      disabled={generateSummaryMutation.isPending}
                                    >
                                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                                      {generateSummaryMutation.isPending && selectedCallForSummary?.id === call.id ? "Generating..." : "Generate Summary"}
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                        <div className="py-20 text-center rounded-3xl bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50 shadow-sm">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                            <Phone className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                          </div>
                          <h3 className="font-semibold text-lg mb-1.5 text-gray-900 dark:text-gray-100">No call history yet</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Your past calls will appear here</p>
                      </div>
                    )}

                    {/* Pagination */}
                    {pagination && pagination.totalPages > 1 && (
                        <div className="mt-8 flex flex-col items-center gap-4">
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (pagination.hasPreviousPage) {
                                    setCallHistoryPage(callHistoryPage - 1);
                                  }
                                }}
                                  className={`rounded-xl ${!pagination.hasPreviousPage ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                              />
                            </PaginationItem>
                            
                            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => {
                              const showPage = 
                                pageNum === 1 ||
                                pageNum === pagination.totalPages ||
                                (pageNum >= callHistoryPage - 1 && pageNum <= callHistoryPage + 1);
                              
                              if (!showPage) {
                                if (pageNum === callHistoryPage - 2 || pageNum === callHistoryPage + 2) {
                                  return (
                                    <PaginationItem key={pageNum}>
                                        <span className="px-3 py-2 text-gray-400">...</span>
                                    </PaginationItem>
                                  );
                                }
                                return null;
                              }

                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setCallHistoryPage(pageNum);
                                    }}
                                    isActive={pageNum === callHistoryPage}
                                      className="cursor-pointer rounded-xl"
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}
                            
                            <PaginationItem>
                              <PaginationNext
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (pagination.hasNextPage) {
                                    setCallHistoryPage(callHistoryPage + 1);
                                  }
                                }}
                                  className={`rounded-xl ${!pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                          Showing {((callHistoryPage - 1) * 5) + 1} to {Math.min(callHistoryPage * 5, pagination.totalCalls)} of {pagination.totalCalls} calls
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Settings</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Manage your account and profile preferences
                  </p>
                </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto">
                <Card className="border-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Profile Information</CardTitle>
                        <CardDescription>
                          View and edit your complete profile details
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => setEditProfileDialogOpen(true)}
                        variant="outline"
                        size="sm"
                        data-testid="button-edit-profile"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Profile
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Name</p>
                        <p className="font-medium text-base">{user?.name || "Not set"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Email</p>
                        <p className="font-medium text-base">{user?.email || "Not set"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Contact Number *</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.phoneNumber || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Specialty</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.specialty || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">City</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.city || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Education</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.education || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Experience</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.experience || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Institution</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.institution || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Languages</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.languages || "Not set"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">LinkedIn URL</p>
                        {(user as DoctorWithProfile)?.doctorProfile?.linkedinUrl ? (
                          <a
                            href={(user as DoctorWithProfile)?.doctorProfile?.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-base text-primary hover:underline break-all"
                          >
                            {(user as DoctorWithProfile)?.doctorProfile?.linkedinUrl}
                          </a>
                        ) : (
                          <p className="font-medium text-base">Not set</p>
                        )}
                      </div>
                    </div>
                    <div className="pt-6 border-t">
                      <p className="text-sm font-semibold text-muted-foreground mb-3">Short Bio</p>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-base whitespace-pre-wrap leading-relaxed">
                        {(user as DoctorWithProfile)?.doctorProfile?.shortBio || "Not set"}
                      </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-red-950/20 dark:via-orange-950/20 dark:to-amber-950/20 p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <LogOut className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  Confirm Logout
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  You're about to sign out of your account. All unsaved changes will be lost. You'll need to sign in again to access your dashboard.
                </AlertDialogDescription>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-background">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email || ''}
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
            <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1">
              Stay Logged In
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={logout}
              className="w-full sm:w-auto order-1 sm:order-2 bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Yes, Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* End Call Confirmation Dialog */}
      <AlertDialog open={endCallConfirmDialogOpen} onOpenChange={(open) => {
        console.log("Dialog onOpenChange:", open);
        setEndCallConfirmDialogOpen(open);
      }}>
        <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden z-[100]">
          <div className="bg-gradient-to-br from-orange-50 via-red-50 to-amber-50 dark:from-orange-950/20 dark:via-red-950/20 dark:to-amber-950/20 p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <PhoneOff className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  End Call?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Are you sure you want to end this call? The call will be terminated and a summary will be generated automatically.
                </AlertDialogDescription>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-background">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {activeCall?.participantName || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Active call in progress
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
            <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1">
              Continue Call
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("End Call button clicked in dialog, currentCallId:", currentCallId);
                
                if (currentCallId) {
                  console.log("Calling endCallMutation with:", currentCallId);
                  try {
                    const result = await endCallMutation.mutateAsync(currentCallId);
                    console.log("Call ended successfully, result:", result);
                  } catch (error) {
                    console.error("Error ending call:", error);
                    // Still close dialog and clear state even on error
                    setEndCallConfirmDialogOpen(false);
                  }
                } else {
                  console.log("No currentCallId, clearing local state");
                  setActiveCall(null);
                  setCurrentCallId(null);
                  setEndCallConfirmDialogOpen(false);
                }
              }}
              className="w-full sm:w-auto order-1 sm:order-2 bg-orange-600 hover:bg-orange-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
              disabled={endCallMutation.isPending}
              type="button"
              autoFocus={false}
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              {endCallMutation.isPending ? "Ending..." : "End Call"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Stale Calls Confirmation Dialog */}
      <AlertDialog open={clearStaleCallsDialogOpen} onOpenChange={setClearStaleCallsDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  Clear Stale Calls?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  This will clear all inactive call records that may be preventing new calls. Only stale or completed calls will be removed.
                </AlertDialogDescription>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
            <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearStaleCallsMutation.mutate();
                setClearStaleCallsDialogOpen(false);
              }}
              className="w-full sm:w-auto order-1 sm:order-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
              disabled={clearStaleCallsMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${clearStaleCallsMutation.isPending ? "animate-spin" : ""}`} />
              {clearStaleCallsMutation.isPending ? "Clearing..." : "Clear Stale Calls"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Initiate Call Confirmation Dialog */}
      <AlertDialog open={callConfirmDialogOpen} onOpenChange={setCallConfirmDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/20 dark:via-emerald-950/20 dark:to-teal-950/20 p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Phone className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  Initiate Call?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  You're about to start a call with this doctor. Both of you will receive a phone call to connect. The call will be automatically recorded and transcribed.
                </AlertDialogDescription>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-background">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {selectedDoctorForCall?.name?.charAt(0).toUpperCase() || 'D'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {selectedDoctorForCall?.name || 'Doctor'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedDoctorForCall?.doctorProfile?.specialty || 'Specialist'}
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
            <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1" onClick={() => setSelectedDoctorForCall(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedDoctorForCall) {
                  initiateCallMutation.mutate(selectedDoctorForCall.id);
                  setCallConfirmDialogOpen(false);
                  setSelectedDoctorForCall(null);
                }
              }}
              className="w-full sm:w-auto order-1 sm:order-2 bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
              disabled={initiateCallMutation.isPending}
            >
              <Phone className="h-4 w-4 mr-2" />
              {initiateCallMutation.isPending ? "Connecting..." : "Start Call"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generate Summary Confirmation Dialog */}
      <AlertDialog open={summaryConfirmDialogOpen} onOpenChange={setSummaryConfirmDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-br from-purple-50 via-violet-50 to-indigo-50 dark:from-purple-950/20 dark:via-violet-950/20 dark:to-indigo-950/20 p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  Generate AI Summary?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  This will process the call recording, generate a transcript, and create an AI-powered summary with key points and action items. This process may take a few minutes.
                </AlertDialogDescription>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-background">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  Call with {selectedCallForSummary?.calleeName || 'Doctor'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Summary will include transcript, key points, and action items
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
            <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1" onClick={() => setSelectedCallForSummary(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedCallForSummary) {
                  generateSummaryMutation.mutate({ callId: selectedCallForSummary.id });
                }
              }}
              className="w-full sm:w-auto order-1 sm:order-2 bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
              disabled={generateSummaryMutation.isPending}
            >
              <FileText className={`h-4 w-4 mr-2 ${generateSummaryMutation.isPending ? "animate-pulse" : ""}`} />
              {generateSummaryMutation.isPending ? "Generating..." : "Generate Summary"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Summary Generation Error Dialog */}
      <AlertDialog open={summaryErrorDialogOpen} onOpenChange={setSummaryErrorDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-br from-red-50 via-rose-50 to-pink-50 dark:from-red-950/20 dark:via-rose-950/20 dark:to-pink-950/20 p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  Unable to Generate Summary
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {summaryError || "Something went wrong while generating the summary."}
                </AlertDialogDescription>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-background">
            <div className="p-4 rounded-lg bg-muted/30 border border-border border-dashed">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-1">
                    What you can do:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Wait a few minutes and try again</li>
                    <li>Check if the call was recorded</li>
                    <li>Contact support if the issue persists</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-muted/30 gap-3 sm:gap-3">
            <AlertDialogAction
              onClick={() => {
                setSummaryErrorDialogOpen(false);
                setSummaryError(null);
              }}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditDoctorProfileDialog
        open={editProfileDialogOpen}
        onOpenChange={setEditProfileDialogOpen}
        onSubmit={(data) => updateProfileMutation.mutate(data)}
        isLoading={updateProfileMutation.isPending}
        user={user}
      />

      {selectedSurvey && (
        <SurveyResponseViewer
          open={!!selectedSurvey}
          onOpenChange={(open) => !open && setSelectedSurvey(null)}
          survey={{
            id: selectedSurvey.id,
            formName: selectedSurvey.formName,
            when: selectedSurvey.when,
            status: selectedSurvey.status,
            completedAt: selectedSurvey.completedAt,
            responseData: selectedSurvey.responseData,
          }}
        />
      )}

      <Dialog open={qrCodeDialogOpen} onOpenChange={setQrCodeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Your QR Code
            </DialogTitle>
            <DialogDescription>
              Share this QR code with patients so they can link with you
            </DialogDescription>
          </DialogHeader>
          {qrCode?.qrCodeUrl ? (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={qrCode.qrCodeUrl}
                  alt="QR Code for patient linking"
                  className="w-64 h-64"
                />
              </div>
              {qrCode.linkUrl && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Link URL:</p>
                  <p className="text-sm font-mono break-all">{qrCode.linkUrl}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    if (qrCode.linkUrl) {
                      await navigator.clipboard.writeText(qrCode.linkUrl);
                      setCopied(true);
                      toast({
                        title: "Link copied!",
                        description: "The QR code link has been copied to your clipboard.",
                      });
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Link
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    generateQrMutation.mutate();
                  }}
                  disabled={generateQrMutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${generateQrMutation.isPending ? "animate-spin" : ""}`} />
                  Regenerate
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <QrCode className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Loading QR code...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
    <TeddyAssistant userRole="DOCTOR" />
    </>
  );
}

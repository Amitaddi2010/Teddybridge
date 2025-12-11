import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Phone,
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
  } | null>(null);
  const [editProfileDialogOpen, setEditProfileDialogOpen] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyWithPatient & { responseData?: any } | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
      // Refetch more frequently (5 seconds) if there's an active call, otherwise 10 seconds
      const hasActiveCall = query.state.data?.calls?.some((call: any) => call.isLive && !call.endedAt);
      return hasActiveCall ? 5000 : 10000;
    },
  });

  const callHistory = callHistoryData?.calls || [];
  const pagination = callHistoryData?.pagination;

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
      setCurrentCallId(callData.id);
      setActiveCall({ 
        participantName: callee?.name || "Doctor",
        transcript: "",
        aiSummary: "",
      });
      toast({
        title: "Connecting call...",
        description: "You will receive a phone call shortly.",
      });
    },
    onError: async (error) => {
      const errorMessage = error instanceof Error ? error.message : "Something went wrong";
      
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
      }
      
      toast({
        title: "Failed to initiate call",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const clearStaleCallsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/doctor/calls/clear-stale", {});
    },
    onSuccess: (data) => {
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
      toast({
        title: "Call ended",
        description: "The call has been ended locally.",
        variant: "destructive",
      });
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
      return apiRequest("POST", "/api/redcap/poll-surveys");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctor/surveys/with-data"] });
      // Only show toast if surveys were actually updated
      if (data && data.updated > 0) {
        toast({
          title: "Surveys updated",
          description: `${data.updated} survey(s) have been marked as completed.`,
        });
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
      <CallView
        participantName={activeCall.participantName}
        isConnecting={initiateCallMutation.isPending}
        onEndCall={() => {
          if (currentCallId) {
            endCallMutation.mutate(currentCallId);
          } else {
            setActiveCall(null);
            setCurrentCallId(null);
          }
        }}
        transcript={activeCall.transcript}
        aiSummary={activeCall.aiSummary}
        showTranscript={true}
      />
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
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
                      onClick={logout} 
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
                              <p className="text-sm font-medium text-muted-foreground mb-1">Active Calls</p>
                              <p className="text-3xl font-bold">0</p>
                              <p className="text-xs text-muted-foreground mt-1">Doctor-to-doctor</p>
                            </div>
                            <Phone className="h-10 w-10 text-primary opacity-60" />
                          </div>
                        </CardContent>
                      </Card>
                </div>

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
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Doctor-to-Doctor Calls</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Secure communication with AI-powered transcription and call summaries
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Available Doctors</h2>
                    <p className="text-muted-foreground">
                      Connect with other doctors for consultations
                    </p>
                  </div>
                  <Button
                    onClick={() => clearStaleCallsMutation.mutate()}
                    variant="outline"
                    size="sm"
                    disabled={clearStaleCallsMutation.isPending}
                  >
                    {clearStaleCallsMutation.isPending ? "Clearing..." : "Clear Stale Calls"}
                  </Button>
                </div>

                <Card className="border-2">
                  <CardHeader>
                    <CardTitle>Available Doctors</CardTitle>
                    <CardDescription>
                      Call other doctors for consultations with AI-powered transcription
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {doctors?.filter(d => d.id !== user?.id).length === 0 ? (
                      <div className="py-12 text-center">
                        <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No other doctors available</h3>
                        <p className="text-muted-foreground">
                          Other doctors will appear here when they join the platform
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {doctors?.filter(d => d.id !== user?.id).map(doctor => (
                          <div
                            key={doctor.id}
                            className="flex items-center justify-between gap-4 p-4 rounded-lg border-2 hover:border-primary/50 transition-colors hover:bg-accent/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <Users className="h-6 w-6 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold text-base">{doctor.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {doctor.doctorProfile?.specialty || "Healthcare Provider"}
                                </p>
                                {doctor.doctorProfile?.city && (
                                  <p className="text-xs text-muted-foreground">
                                    {doctor.doctorProfile.city}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              onClick={() => initiateCallMutation.mutate(doctor.id)}
                              disabled={initiateCallMutation.isPending || !!activeCall}
                              data-testid={`button-call-doctor-${doctor.id}`}
                              size="lg"
                            >
                              <Phone className="h-4 w-4 mr-2" />
                              {activeCall ? "In Call" : "Call"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Call History */}
                <div className="mt-8">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold">Call History</h2>
                    <p className="text-muted-foreground">
                      View your past doctor-to-doctor calls with summaries
                    </p>
                  </div>
                <Card className="border-2">
                  <CardHeader>
                    <CardTitle>Recent Calls</CardTitle>
                    <CardDescription>
                      Browse and download transcripts from your previous consultations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingCallHistory ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="h-24" />
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
                              className="p-5 rounded-lg border-2 hover:border-primary/50 transition-colors space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                      <Phone className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                      <p className="font-semibold text-base">
                                        {isCaller ? "Called" : "Received call from"} {otherDoctor?.name || "Unknown Doctor"}
                                      </p>
                                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                        {callDate && (
                                          <span>{callDate.toLocaleString()}</span>
                                        )}
                                        {callDuration !== null && (
                                          <span>• Duration: {callDuration} min</span>
                                        )}
                                        {call.isLive && (
                                          <span className="text-green-600 font-medium">• Live</span>
                                        )}
                                        {call.endedAt && (
                                          <span className="text-muted-foreground">• Ended</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {call.summaryText && (
                                <div className="mt-4 pt-4 border-t">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-semibold">Call Summary</p>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const url = `/api/doctor/call/${call.id}/download/pdf`;
                                          window.open(url, '_blank');
                                        }}
                                        className="h-8"
                                      >
                                        <Download className="h-3 w-3 mr-1" />
                                        PDF
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const url = `/api/doctor/call/${call.id}/download/doc`;
                                          window.open(url, '_blank');
                                        }}
                                        className="h-8"
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        DOC
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="p-4 bg-muted/50 rounded-lg">
                                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                      {call.summaryText}
                                    </p>
                                  </div>
                                  {call.transcriptText && (
                                    <details className="mt-4">
                                      <summary className="text-sm font-semibold cursor-pointer text-primary hover:text-primary/80 transition-colors">
                                        View Full Transcript
                                      </summary>
                                      <div className="mt-3 p-4 bg-muted rounded-lg">
                                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                          {call.transcriptText}
                                        </p>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              )}
                              
                              {call.liveSummary && !call.summaryText && (
                                <div className="mt-4 pt-4 border-t">
                                  <p className="text-sm font-semibold mb-2">Live Summary</p>
                                  <div className="p-4 bg-muted/50 rounded-lg">
                                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                      {call.liveSummary}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {!call.summaryText && !call.liveSummary && call.endedAt && (
                                <div className="mt-4 pt-4 border-t">
                                  <p className="text-sm text-muted-foreground italic mb-3">
                                    No summary available for this call.
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        // Try to find recording and process it
                                        const response = await fetch(`/api/doctor/call/${call.id}/recording-info`, {
                                          credentials: "include",
                                        });
                                        const data = await response.json();
                                        
                                        if (data.recordings && data.recordings.length > 0) {
                                          // Use the most recent recording
                                          const latestRecording = data.recordings[0];
                                          const processResponse = await fetch(`/api/doctor/call/${call.id}/process-recording`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            credentials: "include",
                                            body: JSON.stringify({ recordingSid: latestRecording.sid }),
                                          });
                                          
                                          if (processResponse.ok) {
                                            toast({
                                              title: "Summary generation started",
                                              description: "The summary will be available shortly. Please refresh in a few minutes.",
                                            });
                                            // Refresh call history after a delay
                                            setTimeout(() => {
                                              queryClient.invalidateQueries({ queryKey: ["/api/doctor/calls"] });
                                            }, 30000); // Refresh after 30 seconds
                                          } else {
                                            throw new Error("Failed to start processing");
                                          }
                                        } else {
                                          toast({
                                            title: "No recording found",
                                            description: "No recording is available for this call. The call may not have been recorded.",
                                            variant: "destructive",
                                          });
                                        }
                                      } catch (error: any) {
                                        toast({
                                          title: "Failed to generate summary",
                                          description: error.message || "Could not process recording. Please check server logs.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    <FileText className="h-3 w-3 mr-1" />
                                    Generate Summary
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <Phone className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No call history yet</h3>
                        <p className="text-muted-foreground">Your past calls will appear here</p>
                      </div>
                    )}

                    {/* Pagination */}
                    {pagination && pagination.totalPages > 1 && (
                      <div className="mt-6">
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
                                className={!pagination.hasPreviousPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                            
                            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => {
                              // Show first page, last page, current page, and pages around current
                              const showPage = 
                                pageNum === 1 ||
                                pageNum === pagination.totalPages ||
                                (pageNum >= callHistoryPage - 1 && pageNum <= callHistoryPage + 1);
                              
                              if (!showPage) {
                                // Show ellipsis
                                if (pageNum === callHistoryPage - 2 || pageNum === callHistoryPage + 2) {
                                  return (
                                    <PaginationItem key={pageNum}>
                                      <span className="px-4 py-2">...</span>
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
                                    className="cursor-pointer"
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
                                className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                        <div className="text-center text-sm text-muted-foreground mt-2">
                          Showing {((callHistoryPage - 1) * 5) + 1} to {Math.min(callHistoryPage * 5, pagination.totalCalls)} of {pagination.totalCalls} calls
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
  );
}

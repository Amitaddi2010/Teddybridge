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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qr/my-code"] });
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
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <div className="p-4">
                <Logo size="md" />
              </div>
            </SidebarGroup>
            
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => setActiveTab(item.id)}
                        isActive={activeTab === item.id}
                        data-testid={`nav-${item.id}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={logout} data-testid="button-logout">
                      <LogOut className="h-4 w-4" />
                      <span>Log Out</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between gap-4 p-4 border-b bg-background">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h1 className="text-xl font-semibold" data-testid="text-page-title">
                {navItems.find(i => i.id === activeTab)?.title || "Dashboard"}
              </h1>
            </div>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto p-6 bg-background">
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard
                    title="Total Patients"
                    value={totalPatients}
                    icon={Users}
                    description="Linked via QR code"
                  />
                  <StatsCard
                    title="Pending PROMS"
                    value={pendingSurveys}
                    icon={Send}
                    description="Awaiting completion"
                  />
                  <StatsCard
                    title="Completed Surveys"
                    value={completedSurveys}
                    icon={ClipboardCheck}
                    description="Ready for review"
                  />
                  <StatsCard
                    title="Active Calls"
                    value={0}
                    icon={Phone}
                    description="Doctor-to-doctor"
                  />
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div>
                          <CardTitle>PROMS Overview</CardTitle>
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
            )}

            {activeTab === "patients" && (
              <div className="space-y-6">
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
            )}

            {activeTab === "proms" && (
              <div className="space-y-6">
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
            )}

            {activeTab === "calls" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Doctor Calls</h2>
                    <p className="text-muted-foreground">
                      Secure doctor-to-doctor communication with transcription
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

                <Card>
                  <CardHeader>
                    <CardTitle>Available Doctors</CardTitle>
                    <CardDescription>
                      Call other doctors for consultations with AI-powered transcription
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {doctors?.filter(d => d.id !== user?.id).length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        No other doctors available for calls
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {doctors?.filter(d => d.id !== user?.id).map(doctor => (
                          <div
                            key={doctor.id}
                            className="flex items-center justify-between gap-4 p-4 rounded-lg border hover-elevate"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <Users className="h-5 w-5 text-green-600" />
                              </div>
                              <div>
                                <p className="font-medium">{doctor.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {doctor.doctorProfile?.specialty || "Healthcare Provider"}
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={() => initiateCallMutation.mutate(doctor.id)}
                              disabled={initiateCallMutation.isPending || !!activeCall}
                              data-testid={`button-call-doctor-${doctor.id}`}
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
                <Card>
                  <CardHeader>
                    <CardTitle>Call History</CardTitle>
                    <CardDescription>
                      View your past doctor-to-doctor calls with summaries
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
                              className="p-4 rounded-lg border space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <p className="font-medium">
                                      {isCaller ? "Called" : "Received call from"} {otherDoctor?.name || "Unknown Doctor"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    {callDate && (
                                      <span>{callDate.toLocaleString()}</span>
                                    )}
                                    {callDuration !== null && (
                                      <span>Duration: {callDuration} min</span>
                                    )}
                                    {call.isLive && (
                                      <span className="text-green-600 font-medium">Live</span>
                                    )}
                                    {call.endedAt && (
                                      <span className="text-muted-foreground">Ended</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {call.summaryText && (
                                <div className="mt-3 pt-3 border-t">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-medium">Call Summary</p>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const url = `/api/doctor/call/${call.id}/download/pdf`;
                                          window.open(url, '_blank');
                                        }}
                                        className="h-7 text-xs"
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
                                        className="h-7 text-xs"
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        DOC
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {call.summaryText}
                                  </p>
                                  {call.transcriptText && (
                                    <details className="mt-3">
                                      <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                                        View Full Transcript
                                      </summary>
                                      <div className="mt-2 p-3 bg-muted rounded-md">
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                          {call.transcriptText}
                                        </p>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              )}
                              
                              {call.liveSummary && !call.summaryText && (
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-sm font-medium mb-1">Live Summary</p>
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {call.liveSummary}
                                  </p>
                                </div>
                              )}
                              
                              {!call.summaryText && !call.liveSummary && call.endedAt && (
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-sm text-muted-foreground italic mb-2">
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
                      <div className="py-8 text-center text-muted-foreground">
                        <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No call history yet</p>
                        <p className="text-sm mt-2">Your past calls will appear here</p>
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
            )}

            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Settings</h2>
                  <p className="text-muted-foreground">
                    Manage your account and preferences
                  </p>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Complete Profile Information</CardTitle>
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
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Name</p>
                        <p className="font-medium text-base">{user?.name || "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                        <p className="font-medium text-base">{user?.email || "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Contact Number *</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.phoneNumber || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Specialty</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.specialty || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">City</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.city || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Education</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.education || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Experience</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.experience || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Institution</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.institution || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Languages</p>
                        <p className="font-medium text-base">
                          {(user as DoctorWithProfile)?.doctorProfile?.languages || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">LinkedIn URL</p>
                        {(user as DoctorWithProfile)?.doctorProfile?.linkedinUrl ? (
                          <a
                            href={(user as DoctorWithProfile)?.doctorProfile?.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-base text-primary hover:underline"
                          >
                            {(user as DoctorWithProfile)?.doctorProfile?.linkedinUrl}
                          </a>
                        ) : (
                          <p className="font-medium text-base">Not set</p>
                        )}
                      </div>
                    </div>
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Short Bio</p>
                      <p className="text-base whitespace-pre-wrap">
                        {(user as DoctorWithProfile)?.doctorProfile?.shortBio || "Not set"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
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
    </SidebarProvider>
  );
}

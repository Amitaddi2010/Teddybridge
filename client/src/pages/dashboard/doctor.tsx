import { useState } from "react";
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

  const { data: surveys, isLoading: loadingSurveys } = useQuery<SurveyWithPatient[]>({
    queryKey: ["/api/doctor/surveys"],
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

  const { refreshUser } = useAuth();
  
  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      name?: string;
      phoneNumber?: string;
      specialty?: string;
      city?: string;
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

  const initiateCallMutation = useMutation({
    mutationFn: async (calleeDoctorId: string) => {
      return apiRequest("POST", "/api/twilio/call", { calleeDoctorId });
    },
    onSuccess: (_, calleeDoctorId) => {
      const callee = doctors?.find(d => d.id === calleeDoctorId);
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
    onError: (error) => {
      toast({
        title: "Failed to initiate call",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const pendingSurveys = surveys?.filter(s => s.status === "PENDING" || s.status === "SENT").length || 0;
  const completedSurveys = surveys?.filter(s => s.status === "COMPLETED").length || 0;
  const totalPatients = linkedPatients?.length || 0;

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
        onEndCall={() => setActiveCall(null)}
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
                  {linkedPatients && linkedPatients.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {linkedPatients.length} linked patient{linkedPatients.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {loadingSurveys || loadingPatients ? (
                  <Skeleton className="h-64" />
                ) : (
                  <PromsTable
                    surveys={surveys || []}
                    linkedPatients={linkedPatients?.map(r => ({
                      id: r.patient?.id || r.patientId,
                      name: r.patient?.name || "Unknown Patient",
                      email: r.patient?.email || "",
                      patientProfile: r.patient?.patientProfile,
                    })).filter(p => p.id) as User[] || []}
                    onSendSurvey={(patientId, type) => 
                      sendSurveyMutation.mutate({ patientId, type })
                    }
                    isLoading={sendSurveyMutation.isPending}
                  />
                )}
              </div>
            )}

            {activeTab === "calls" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Doctor Calls</h2>
                  <p className="text-muted-foreground">
                    Secure doctor-to-doctor communication with transcription
                  </p>
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
                              disabled={initiateCallMutation.isPending}
                              data-testid={`button-call-doctor-${doctor.id}`}
                            >
                              <Phone className="h-4 w-4 mr-2" />
                              Call
                            </Button>
                          </div>
                        ))}
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
                      <CardTitle>Profile Information</CardTitle>
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
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Name</p>
                        <p className="font-medium">{user?.name}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email</p>
                        <p className="font-medium">{user?.email}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Specialty</p>
                        <p className="font-medium">
                          {(user as DoctorWithProfile)?.doctorProfile?.specialty || "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">City</p>
                        <p className="font-medium">
                          {(user as DoctorWithProfile)?.doctorProfile?.city || "Not set"}
                        </p>
                      </div>
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
    </SidebarProvider>
  );
}

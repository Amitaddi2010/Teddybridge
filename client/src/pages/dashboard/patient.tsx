import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PatientCard } from "@/components/patient-card";
import { ConnectionRequestCard } from "@/components/connection-request-card";
import { MeetingCard } from "@/components/meeting-card";
import { InviteDialog } from "@/components/invite-dialog";
import { ScheduleDialog } from "@/components/schedule-dialog";
import { CallView } from "@/components/call-view";
import { EditPatientProfileDialog } from "@/components/edit-patient-profile-dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  LayoutDashboard,
  Users, 
  Calendar, 
  UserPlus, 
  Search, 
  LogOut, 
  Link as LinkIcon,
  Phone,
  ClipboardCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Edit,
  Settings,
  Loader2
} from "lucide-react";
import type { User, PatientProfile, PatientConnection, SurveyRequest } from "@shared/schema";

type PatientWithProfile = User & { patientProfile?: PatientProfile | null };
type ConnectionWithUsers = PatientConnection & { 
  requester?: User | null; 
  target?: User | null;
};

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientWithProfile | null>(null);
  const [activeCall, setActiveCall] = useState<{ participantName: string } | null>(null);
  const [expandedSurveys, setExpandedSurveys] = useState<Set<string>>(new Set());
  const [loadingSurveyIframes, setLoadingSurveyIframes] = useState<Set<string>>(new Set());
  const [editProfileDialogOpen, setEditProfileDialogOpen] = useState(false);

  const { data: patients, isLoading: loadingPatients } = useQuery<PatientWithProfile[]>({
    queryKey: ["/api/patient/available"],
  });

  const { data: connections, isLoading: loadingConnections } = useQuery<ConnectionWithUsers[]>({
    queryKey: ["/api/patient/connections"],
  });

  const { data: linkedDoctors, isLoading: loadingLinkedDoctors } = useQuery<any[]>({
    queryKey: ["/api/patient/linked-doctors"],
  });

  const { data: surveys, isLoading: loadingSurveys } = useQuery<SurveyRequest[]>({
    queryKey: ["/api/patient/surveys"],
  });

  const { refreshUser } = useAuth();
  
  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      name?: string;
      phoneNumber?: string;
      demographics?: {
        age?: number;
        gender?: string;
        procedure?: string;
      };
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

  const sendInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest("POST", "/api/patient/invite", { toEmail: email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patient/connections"] });
      setInviteDialogOpen(false);
      toast({
        title: "Invitation sent!",
        description: "Your peer will receive an email to accept your connection request.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to send invitation",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const acceptConnectionMutation = useMutation({
    mutationFn: async (inviteToken: string) => {
      return apiRequest("POST", "/api/patient/invite/accept", { inviteToken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patient/connections"] });
      toast({
        title: "Connection accepted!",
        description: "You can now call and schedule meetings with this peer.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to accept connection",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const declineConnectionMutation = useMutation({
    mutationFn: async (inviteToken: string) => {
      return apiRequest("POST", "/api/patient/invite/decline", { inviteToken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patient/connections"] });
      toast({
        title: "Connection declined",
      });
    },
  });

  const scheduleCallMutation = useMutation({
    mutationFn: async ({ targetPatientId, scheduledAt, durationMinutes }: { 
      targetPatientId: string; 
      scheduledAt: Date; 
      durationMinutes: number;
    }) => {
      return apiRequest("POST", "/api/patient/call/schedule", { 
        targetPatientId, 
        scheduledAt: scheduledAt.toISOString(), 
        durationMinutes 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patient/connections"] });
      setScheduleDialogOpen(false);
      setSelectedPatient(null);
      toast({
        title: "Call scheduled!",
        description: "Both you and your peer will receive email reminders.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to schedule call",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const initiateCallMutation = useMutation({
    mutationFn: async (targetPatientId: string) => {
      return apiRequest("POST", "/api/patient/call/initiate", { 
        targetPatientId, 
        mode: "voice" 
      });
    },
    onSuccess: (_, targetPatientId) => {
      const target = patients?.find(p => p.id === targetPatientId);
      setActiveCall({ participantName: target?.name || "Peer" });
      toast({
        title: "Connecting call...",
        description: "You will receive a phone call shortly.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to initiate call",
        description: error instanceof Error ? error.message : "Please ensure you have a verified phone number",
        variant: "destructive",
      });
    },
  });

  const incomingRequests = connections?.filter(
    c => c.targetPatientId === user?.id && c.status === "PENDING"
  ) || [];

  const outgoingRequests = connections?.filter(
    c => c.requesterPatientId === user?.id && c.status === "PENDING"
  ) || [];

  const confirmedConnections = connections?.filter(c => c.status === "CONFIRMED") || [];

  const scheduledMeetings = confirmedConnections.filter(c => c.scheduledAt);

  const filteredPatients = patients?.filter(p => 
    p.id !== user?.id && 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const getConnectionForPatient = (patientId: string) => {
    return connections?.find(
      c => (c.requesterPatientId === patientId || c.targetPatientId === patientId)
    );
  };

  const navItems = [
    { title: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
    { title: "Peers", icon: Users, id: "peers" },
    { title: "Connections", icon: LinkIcon, id: "connections" },
    { title: "Doctors", icon: LinkIcon, id: "doctors" },
    { title: "Surveys", icon: ClipboardCheck, id: "surveys" },
    { title: "Meetings", icon: Calendar, id: "meetings" },
    { title: "Settings", icon: Settings, id: "settings" },
  ];

  if (activeCall) {
    return (
      <CallView
        participantName={activeCall.participantName}
        isConnecting={initiateCallMutation.isPending}
        onEndCall={() => setActiveCall(null)}
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
                        {item.id === "connections" && incomingRequests.length > 0 && (
                          <span className="ml-auto bg-primary-foreground/20 text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                            {incomingRequests.length}
                          </span>
                        )}
                        {item.id === "doctors" && linkedDoctors && linkedDoctors.length > 0 && (
                          <span className="ml-auto bg-primary-foreground/20 text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                            {linkedDoctors.length}
                          </span>
                        )}
                        {item.id === "surveys" && surveys && surveys.filter(s => s.status === "SENT" || s.status === "PENDING").length > 0 && (
                          <span className="ml-auto bg-primary-foreground/20 text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                            {surveys.filter(s => s.status === "SENT" || s.status === "PENDING").length}
                          </span>
                        )}
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
                        Taking You from Connection to Recovery
                      </h1>
                      <p className="text-lg md:text-xl text-white/85 max-w-3xl">
                        We help patients find, connect, and support each other through their healthcare journey. One platform to unify your entire peer support workflow.
                      </p>
                    </div>
                    <Button 
                      onClick={() => setInviteDialogOpen(true)} 
                      size="lg"
                      className="bg-white text-gray-900 hover:bg-white/90"
                      data-testid="button-invite-peer"
                    >
                      <UserPlus className="h-5 w-5 mr-2" />
                      Invite a Peer
                    </Button>
                  </div>
                </section>

                {/* Stats Cards */}
                <section className="py-16 px-6 bg-background">
                  <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card className="border-2">
                        <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Connections</p>
                              <p className="text-3xl font-bold">{confirmedConnections.length}</p>
                              <p className="text-xs text-muted-foreground mt-1">Active peers</p>
                        </div>
                            <Users className="h-10 w-10 text-primary opacity-60" />
                      </div>
                    </CardContent>
                  </Card>
                      <Card className="border-2">
                        <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Linked Doctors</p>
                              <p className="text-3xl font-bold">{linkedDoctors?.length || 0}</p>
                              <p className="text-xs text-muted-foreground mt-1">Via QR code</p>
                        </div>
                            <LinkIcon className="h-10 w-10 text-primary opacity-60" />
                      </div>
                    </CardContent>
                  </Card>
                      <Card className="border-2">
                        <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Pending Surveys</p>
                              <p className="text-3xl font-bold">
                            {surveys?.filter(s => s.status === "SENT" || s.status === "PENDING").length || 0}
                          </p>
                              <p className="text-xs text-muted-foreground mt-1">Awaiting completion</p>
                        </div>
                            <ClipboardCheck className="h-10 w-10 text-primary opacity-60" />
                      </div>
                    </CardContent>
                  </Card>
                      <Card className="border-2">
                        <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Scheduled Meetings</p>
                              <p className="text-3xl font-bold">{scheduledMeetings.length}</p>
                              <p className="text-xs text-muted-foreground mt-1">Upcoming calls</p>
                        </div>
                            <Calendar className="h-10 w-10 text-primary opacity-60" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "peers" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Find top opportunities across your network</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Monitor available peers in real time. Never miss another connection opportunity again.
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search peers by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-peers"
              />
                      </div>
                      <Button onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-peer">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite Peer
                      </Button>
            </div>

            {loadingPatients ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : filteredPatients.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No peers found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery 
                      ? "Try a different search term"
                      : "Invite peers to connect with you"}
                  </p>
                  <Button onClick={() => setInviteDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite a Peer
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPatients.map(patient => (
                  <PatientCard
                    key={patient.id}
                    patient={patient}
                    connection={getConnectionForPatient(patient.id)}
                    onConnect={() => {
                      if (patient.email) {
                        sendInviteMutation.mutate(patient.email);
                      }
                    }}
                    onCall={() => initiateCallMutation.mutate(patient.id)}
                    onSchedule={() => {
                      setSelectedPatient(patient);
                      setScheduleDialogOpen(true);
                    }}
                    isLoading={sendInviteMutation.isPending}
                  />
                ))}
              </div>
            )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "connections" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">My Connections</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Manage your peer connections and requests
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
                
            {incomingRequests.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold mb-1">Incoming Requests</h3>
                  <p className="text-sm text-muted-foreground">Accept or decline connection requests from peers</p>
                </div>
                <div className="space-y-3">
                  {incomingRequests.map(connection => (
                    <ConnectionRequestCard
                      key={connection.id}
                      connection={connection}
                      isIncoming={true}
                      currentUserId={user?.id || ""}
                      onAccept={() => acceptConnectionMutation.mutate(connection.inviteToken)}
                      onDecline={() => declineConnectionMutation.mutate(connection.inviteToken)}
                      isLoading={acceptConnectionMutation.isPending || declineConnectionMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {outgoingRequests.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold mb-1">Sent Requests</h3>
                  <p className="text-sm text-muted-foreground">Pending connection requests you've sent</p>
                </div>
                <div className="space-y-3">
                  {outgoingRequests.map(connection => (
                    <ConnectionRequestCard
                      key={connection.id}
                      connection={connection}
                      isIncoming={false}
                      currentUserId={user?.id || ""}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold mb-1">Confirmed Connections</h3>
                <p className="text-sm text-muted-foreground">Your active peer connections</p>
              </div>
              {confirmedConnections.length === 0 ? (
                <Card className="border-2">
                  <CardContent className="py-12 text-center">
                    <LinkIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No confirmed connections yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Send invites to start connecting with peers!
                    </p>
                    <Button onClick={() => setInviteDialogOpen(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Invite a Peer
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {confirmedConnections.map(connection => {
                    const otherUser = connection.requesterPatientId === user?.id 
                      ? connection.target 
                      : connection.requester;
                    return (
                      <Card key={connection.id} className="border-2 hover:border-primary/50 transition-colors">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Users className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base truncate">{otherUser?.name || "Unknown"}</p>
                              <p className="text-sm text-muted-foreground">Connected</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-3 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => otherUser && initiateCallMutation.mutate(otherUser.id)}
                              data-testid={`button-call-connection-${connection.id}`}
                            >
                              <Phone className="h-4 w-4 mr-1" />
                              Call
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                if (otherUser) {
                                  setSelectedPatient(otherUser as PatientWithProfile);
                                  setScheduleDialogOpen(true);
                                }
                              }}
                              data-testid={`button-schedule-connection-${connection.id}`}
                            >
                              <Calendar className="h-4 w-4 mr-1" />
                              Schedule
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "doctors" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">My Doctors</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Doctors you've linked with via QR code
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
              {loadingLinkedDoctors ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2].map(i => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : !linkedDoctors || linkedDoctors.length === 0 ? (
                <Card className="border-2">
                  <CardContent className="py-12 text-center">
                    <LinkIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No doctors linked</h3>
                    <p className="text-muted-foreground mb-4">
                      Scan a doctor's QR code to link with them
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {linkedDoctors.map((record) => {
                    const doctor = record.doctor;
                    if (!doctor) return null;
                    return (
                      <Card key={record.id} className="border-2 hover:border-primary/50 transition-colors">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Users className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base truncate">{doctor.name}</p>
                              {doctor.doctorProfile?.specialty && (
                                <p className="text-sm text-muted-foreground truncate mt-1">
                                  {doctor.doctorProfile.specialty}
                                </p>
                              )}
                              {doctor.doctorProfile?.city && (
                                <p className="text-xs text-muted-foreground truncate mt-1">
                                  {doctor.doctorProfile.city}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                Linked {new Date(record.linkedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
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

            {activeTab === "surveys" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Surveys</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Complete surveys sent by your doctors to track your health outcomes
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
              {loadingSurveys ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : !surveys || surveys.length === 0 ? (
                <Card className="border-2">
                  <CardContent className="py-12 text-center">
                    <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No surveys yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Your doctors will send you surveys to complete
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {surveys.map((survey) => {
                    const isPending = survey.status === "PENDING" || survey.status === "SENT";
                    const isCompleted = survey.status === "COMPLETED";
                    const isExpanded = expandedSurveys.has(survey.id);
                    const surveyUrl = survey.surveyLink || "https://redcap.link/CarebridgeAI";
                    
                    return (
                      <Card key={survey.id} className="border-2 hover:border-primary/50 transition-colors">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold">
                                  {survey.formName || `${survey.when === 'preop' ? 'Pre-Operative' : 'Post-Operative'} Survey`}
                                </h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  isCompleted 
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : isPending
                                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}>
                                  {survey.status}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {survey.when === 'preop' ? 'Pre-Operative' : survey.when === 'postop' ? 'Post-Operative' : 'General'} Health Survey
                              </p>
                              {survey.scheduledAt && (
                                <p className="text-xs text-muted-foreground">
                                  Scheduled: {new Date(survey.scheduledAt).toLocaleDateString()}
                                </p>
                              )}
                              {survey.createdAt && (
                                <p className="text-xs text-muted-foreground">
                                  Sent: {new Date(survey.createdAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {isPending && surveyUrl && (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      const newExpanded = new Set(expandedSurveys);
                                      if (isExpanded) {
                                        newExpanded.delete(survey.id);
                                        // Remove from loading when hiding
                                        const newLoading = new Set(loadingSurveyIframes);
                                        newLoading.delete(survey.id);
                                        setLoadingSurveyIframes(newLoading);
                                      } else {
                                        newExpanded.add(survey.id);
                                        // Add to loading when showing
                                        const newLoading = new Set(loadingSurveyIframes);
                                        newLoading.add(survey.id);
                                        setLoadingSurveyIframes(newLoading);
                                      }
                                      setExpandedSurveys(newExpanded);
                                    }}
                                    data-testid={`button-toggle-survey-${survey.id}`}
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="h-4 w-4 mr-2" />
                                        Hide Survey
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-4 w-4 mr-2" />
                                        Show Survey
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    onClick={() => window.open(surveyUrl, '_blank')}
                                    data-testid={`button-open-survey-${survey.id}`}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open in New Tab
                                  </Button>
                                </>
                              )}
                              {isCompleted && (
                                <div className="text-sm text-muted-foreground">
                                  Completed {survey.completedAt ? new Date(survey.completedAt).toLocaleDateString() : ''}
                                </div>
                              )}
                            </div>
                          </div>
                          {isPending && isExpanded && surveyUrl && (
                            <div className="mt-4 border-t pt-4">
                              <div className="mb-2">
                                <p className="text-sm font-medium mb-1">Complete the survey below:</p>
                                <p className="text-xs text-muted-foreground">
                                  Fill out all required fields and submit when finished.
                                </p>
                              </div>
                              <div className="w-full border rounded-lg overflow-hidden relative" style={{ minHeight: '600px' }}>
                                {loadingSurveyIframes.has(survey.id) && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                                    <div className="flex flex-col items-center gap-3">
                                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                      <p className="text-sm text-muted-foreground font-medium">Loading survey...</p>
                                      <p className="text-xs text-muted-foreground">Please wait while we load the survey form</p>
                                    </div>
                                  </div>
                                )}
                                <iframe
                                  src={surveyUrl}
                                  className="w-full h-full"
                                  style={{ minHeight: '600px', border: 'none', opacity: loadingSurveyIframes.has(survey.id) ? 0 : 1, transition: 'opacity 0.3s ease-in-out' }}
                                  title={`${survey.formName || 'Health Survey'} - REDCap`}
                                  allow="fullscreen"
                                  data-testid={`iframe-survey-${survey.id}`}
                                  onLoad={() => {
                                    // Remove from loading when iframe loads
                                    const newLoading = new Set(loadingSurveyIframes);
                                    newLoading.delete(survey.id);
                                    setLoadingSurveyIframes(newLoading);
                                  }}
                                  onError={() => {
                                    // Remove from loading on error too
                                    const newLoading = new Set(loadingSurveyIframes);
                                    newLoading.delete(survey.id);
                                    setLoadingSurveyIframes(newLoading);
                                  }}
                                />
                              </div>
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

            {activeTab === "meetings" && (
              <div className="space-y-0">
                {/* Hero Section */}
                <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-6">
                  <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Scheduled Meetings</h2>
                    <p className="text-white/85 text-lg max-w-3xl">
                      Your upcoming peer-to-peer calls
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
              {scheduledMeetings.length === 0 ? (
                <Card className="border-2">
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No meetings scheduled</h3>
                    <p className="text-muted-foreground mb-4">
                      Schedule a call with one of your connections
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {scheduledMeetings.map(meeting => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      currentUserId={user?.id || ""}
                      onJoin={() => {
                        const otherUser = meeting.requesterPatientId === user?.id 
                          ? meeting.target 
                          : meeting.requester;
                        if (otherUser) {
                          initiateCallMutation.mutate(otherUser.id);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
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
                      Manage your account and preferences
                    </p>
                  </div>
                </section>

                <section className="py-8 px-6 bg-background">
                  <div className="max-w-7xl mx-auto space-y-6">
                <Card className="border-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Profile Information</CardTitle>
                        <CardDescription>
                          View and edit your profile details
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
                        <p className="text-sm font-semibold text-muted-foreground">Phone Number</p>
                        <p className="font-medium text-base">
                          {user?.patientProfile?.phoneNumber || "Not provided"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-muted-foreground">Account Type</p>
                        <p className="font-medium text-base capitalize">{user?.role?.toLowerCase() || "Patient"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-2">
                  <CardHeader>
                    <CardTitle>Health Information</CardTitle>
                    <CardDescription>
                      Your medical and demographic information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    {user?.patientProfile?.demographics ? (
                      <div className="grid gap-6 md:grid-cols-2">
                        {user.patientProfile.demographics.age && (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-muted-foreground">Age</p>
                            <p className="font-medium text-base">{user.patientProfile.demographics.age} years</p>
                          </div>
                        )}
                        {user.patientProfile.demographics.gender && (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-muted-foreground">Gender</p>
                            <p className="font-medium text-base">{user.patientProfile.demographics.gender}</p>
                          </div>
                        )}
                        {user.patientProfile.demographics.procedure && (
                          <div className="md:col-span-2 space-y-1">
                            <p className="text-sm font-semibold text-muted-foreground">Procedure</p>
                            <p className="font-medium text-base">{user.patientProfile.demographics.procedure}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-muted-foreground mb-2">No health information available</p>
                        <p className="text-xs text-muted-foreground">Your doctor may add this information during your consultation</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                  </div>
                </section>
              </div>
            )}
      </main>
        </div>
      </div>

      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSubmit={(email) => sendInviteMutation.mutate(email)}
        isLoading={sendInviteMutation.isPending}
      />

      <EditPatientProfileDialog
        open={editProfileDialogOpen}
        onOpenChange={setEditProfileDialogOpen}
        onSubmit={(data) => updateProfileMutation.mutate(data)}
        isLoading={updateProfileMutation.isPending}
        user={user}
      />

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        participantName={selectedPatient?.name || ""}
        onSubmit={(date, duration) => {
          if (selectedPatient) {
            scheduleCallMutation.mutate({
              targetPatientId: selectedPatient.id,
              scheduledAt: date,
              durationMinutes: duration,
            });
          }
        }}
        isLoading={scheduleCallMutation.isPending}
      />
    </SidebarProvider>
  );
}

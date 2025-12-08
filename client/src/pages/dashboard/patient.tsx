import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  Edit
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
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientWithProfile | null>(null);
  const [activeCall, setActiveCall] = useState<{ participantName: string } | null>(null);
  const [expandedSurveys, setExpandedSurveys] = useState<Set<string>>(new Set());
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

  if (activeCall) {
    return (
      <CallView
        participantName={activeCall.participantName}
        isConnecting={initiateCallMutation.isPending}
        onEndCall={() => setActiveCall(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
          <Logo size="md" />
          
          <nav className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="sm" className="gap-2">
              <Users className="h-4 w-4" />
              Connections
            </Button>
            <Button variant="ghost" size="sm" className="gap-2">
              <Calendar className="h-4 w-4" />
              Meetings
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2"
              onClick={() => {
                const tabsList = document.querySelector('[role="tablist"]');
                const profileTab = document.querySelector('[data-testid="tab-profile"]') as HTMLElement;
                if (profileTab) {
                  profileTab.click();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
              <UserIcon className="h-4 w-4" />
              My Profile
            </Button>
          </nav>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-welcome">
              Welcome, {user?.name?.split(" ")[0]}!
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect with peers on your healthcare journey
            </p>
          </div>
          
          <Button onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-peer">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Peer
          </Button>
        </div>

        <Tabs defaultValue="peers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="peers" className="gap-2" data-testid="tab-peers">
              <Users className="h-4 w-4" />
              Available Peers
            </TabsTrigger>
            <TabsTrigger value="connections" className="gap-2" data-testid="tab-connections">
              <LinkIcon className="h-4 w-4" />
              My Connections
              {(incomingRequests.length > 0) && (
                <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {incomingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="doctors" className="gap-2" data-testid="tab-doctors">
              <LinkIcon className="h-4 w-4" />
              My Doctors
              {(linkedDoctors && linkedDoctors.length > 0) && (
                <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {linkedDoctors.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="surveys" className="gap-2" data-testid="tab-surveys">
              <ClipboardCheck className="h-4 w-4" />
              Surveys
              {(surveys && surveys.filter(s => s.status === "SENT" || s.status === "PENDING").length > 0) && (
                <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {surveys.filter(s => s.status === "SENT" || s.status === "PENDING").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="meetings" className="gap-2" data-testid="tab-meetings">
              <Calendar className="h-4 w-4" />
              Meetings
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
              <UserIcon className="h-4 w-4" />
              My Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="peers" className="space-y-6">
            <div className="relative max-w-md">
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
              <div className="grid md:grid-cols-2 gap-4">
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
          </TabsContent>

          <TabsContent value="connections" className="space-y-6">
            {incomingRequests.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Incoming Requests</h3>
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
                <h3 className="font-semibold text-lg">Sent Requests</h3>
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
              <h3 className="font-semibold text-lg">Confirmed Connections</h3>
              {confirmedConnections.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <LinkIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">
                      No confirmed connections yet. Send invites to start connecting!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {confirmedConnections.map(connection => {
                    const otherUser = connection.requesterPatientId === user?.id 
                      ? connection.target 
                      : connection.requester;
                    return (
                      <Card key={connection.id} className="hover-elevate">
                        <CardContent className="p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{otherUser?.name}</p>
                              <p className="text-sm text-muted-foreground">Connected</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => otherUser && initiateCallMutation.mutate(otherUser.id)}
                              data-testid={`button-call-connection-${connection.id}`}
                            >
                              <Phone className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (otherUser) {
                                  setSelectedPatient(otherUser as PatientWithProfile);
                                  setScheduleDialogOpen(true);
                                }
                              }}
                              data-testid={`button-schedule-connection-${connection.id}`}
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="doctors" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Linked Doctors</h3>
                <p className="text-sm text-muted-foreground">
                  Doctors you've linked with via QR code
                </p>
              </div>
              {loadingLinkedDoctors ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2].map(i => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : !linkedDoctors || linkedDoctors.length === 0 ? (
                <Card>
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
                      <Card key={record.id} className="hover-elevate">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Users className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{doctor.name}</p>
                              {doctor.doctorProfile?.specialty && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {doctor.doctorProfile.specialty}
                                </p>
                              )}
                              {doctor.doctorProfile?.city && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {doctor.doctorProfile.city}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
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
          </TabsContent>

          <TabsContent value="surveys" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Health Surveys</h3>
                <p className="text-sm text-muted-foreground">
                  Complete surveys sent by your doctors to track your health outcomes
                </p>
              </div>
              {loadingSurveys ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : !surveys || surveys.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No surveys yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Your doctors will send you surveys to complete
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {surveys.map((survey) => {
                    const isPending = survey.status === "PENDING" || survey.status === "SENT";
                    const isCompleted = survey.status === "COMPLETED";
                    const isExpanded = expandedSurveys.has(survey.id);
                    const surveyUrl = survey.surveyLink || "https://redcap.link/CarebridgeAI";
                    
                    return (
                      <Card key={survey.id} className="hover-elevate">
                        <CardContent className="p-4">
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
                                      } else {
                                        newExpanded.add(survey.id);
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
                              <div className="w-full border rounded-lg overflow-hidden" style={{ minHeight: '600px' }}>
                                <iframe
                                  src={surveyUrl}
                                  className="w-full h-full"
                                  style={{ minHeight: '600px', border: 'none' }}
                                  title={`${survey.formName || 'Health Survey'} - REDCap`}
                                  allow="fullscreen"
                                  data-testid={`iframe-survey-${survey.id}`}
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
          </TabsContent>

          <TabsContent value="meetings" className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Scheduled Meetings</h3>
              {scheduledMeetings.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No meetings scheduled</h3>
                    <p className="text-muted-foreground mb-4">
                      Schedule a call with one of your connections
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
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
          </TabsContent>

          <TabsContent value="profile" className="space-y-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg mb-2">My Profile</h3>
                  <p className="text-sm text-muted-foreground">
                    Your personal information and health profile
                  </p>
                </div>
                <Button
                  onClick={() => setEditProfileDialogOpen(true)}
                  variant="outline"
                  data-testid="button-edit-profile"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Your account and contact details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Name</label>
                      <p className="text-sm font-medium mt-1">{user?.name || "Not set"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="text-sm font-medium mt-1">{user?.email || "Not set"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                      <p className="text-sm font-medium mt-1">
                        {user?.patientProfile?.phoneNumber || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Account Type</label>
                      <p className="text-sm font-medium mt-1 capitalize">{user?.role?.toLowerCase() || "Patient"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Health Information</CardTitle>
                  <CardDescription>
                    Your medical and demographic information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {user?.patientProfile?.demographics ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {user.patientProfile.demographics.age && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Age</label>
                          <p className="text-sm font-medium mt-1">{user.patientProfile.demographics.age} years</p>
                        </div>
                      )}
                      {user.patientProfile.demographics.gender && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Gender</label>
                          <p className="text-sm font-medium mt-1">{user.patientProfile.demographics.gender}</p>
                        </div>
                      )}
                      {user.patientProfile.demographics.procedure && (
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-muted-foreground">Procedure</label>
                          <p className="text-sm font-medium mt-1">{user.patientProfile.demographics.procedure}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <p>No health information available</p>
                      <p className="text-xs mt-2">Your doctor may add this information during your consultation</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Statistics</CardTitle>
                  <CardDescription>
                    Your activity and connections summary
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center p-4 rounded-lg border">
                      <p className="text-2xl font-bold text-primary">
                        {connections?.filter(c => c.status === "CONFIRMED").length || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Active Connections</p>
                    </div>
                    <div className="text-center p-4 rounded-lg border">
                      <p className="text-2xl font-bold text-primary">
                        {linkedDoctors?.length || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Linked Doctors</p>
                    </div>
                    <div className="text-center p-4 rounded-lg border">
                      <p className="text-2xl font-bold text-primary">
                        {surveys?.filter(s => s.status === "COMPLETED").length || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Completed Surveys</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

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
    </div>
  );
}

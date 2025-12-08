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
  Phone
} from "lucide-react";
import type { User, PatientProfile, PatientConnection } from "@shared/schema";

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

  const { data: patients, isLoading: loadingPatients } = useQuery<PatientWithProfile[]>({
    queryKey: ["/api/patient/available"],
  });

  const { data: connections, isLoading: loadingConnections } = useQuery<ConnectionWithUsers[]>({
    queryKey: ["/api/patient/connections"],
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
            <Button variant="ghost" size="sm" className="gap-2">
              <LinkIcon className="h-4 w-4" />
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
            <TabsTrigger value="meetings" className="gap-2" data-testid="tab-meetings">
              <Calendar className="h-4 w-4" />
              Meetings
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
        </Tabs>
      </main>

      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSubmit={(email) => sendInviteMutation.mutate(email)}
        isLoading={sendInviteMutation.isPending}
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

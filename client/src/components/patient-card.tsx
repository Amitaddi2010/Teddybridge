import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Phone, Calendar, UserPlus, Target } from "lucide-react";
import type { User, PatientProfile, PatientConnection } from "@shared/schema";

interface PatientCardProps {
  patient: User & { patientProfile?: PatientProfile | null; matchPercentage?: number };
  connection?: PatientConnection | null;
  onConnect?: () => void;
  onCall?: () => void;
  onSchedule?: () => void;
  isLoading?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function maskPhone(phone?: string | null): string {
  if (!phone) return "No phone";
  const last4 = phone.slice(-4);
  return `***-***-${last4}`;
}

export function PatientCard({
  patient,
  connection,
  onConnect,
  onCall,
  onSchedule,
  isLoading,
}: PatientCardProps) {
  const status = connection?.status?.toLowerCase() as "pending" | "confirmed" | "declined" | undefined;
  const isConnected = status === "confirmed";
  const isPending = status === "pending";

  return (
    <Card className="hover-elevate" data-testid={`card-patient-${patient.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 flex-shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {getInitials(patient.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate" data-testid={`text-patient-name-${patient.id}`}>
                {patient.name}
              </h3>
              {status && <StatusBadge status={status} />}
              {patient.matchPercentage !== undefined && (
                <Badge 
                  variant="secondary" 
                  className="bg-primary/10 text-primary border-primary/20"
                  data-testid={`badge-match-${patient.id}`}
                >
                  <Target className="h-3 w-3 mr-1" />
                  {patient.matchPercentage}% match
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground mt-0.5">
              {maskPhone(patient.patientProfile?.phoneNumber)}
            </p>
            
            {patient.patientProfile?.demographics?.procedure && (
              <p className="text-xs text-muted-foreground mt-1">
                {patient.patientProfile.demographics.procedure}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {!connection && onConnect && (
              <Button
                size="sm"
                onClick={onConnect}
                disabled={isLoading}
                data-testid={`button-connect-${patient.id}`}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Connect
              </Button>
            )}
            
            {isConnected && (
              <>
                {onCall && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onCall}
                    disabled={isLoading}
                    data-testid={`button-call-${patient.id}`}
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                )}
                {onSchedule && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onSchedule}
                    disabled={isLoading}
                    data-testid={`button-schedule-${patient.id}`}
                  >
                    <Calendar className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            
            {isPending && (
              <span className="text-xs text-muted-foreground">Awaiting response</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Phone, Calendar, Clock, Video } from "lucide-react";
import { format, isPast, isFuture, isToday } from "date-fns";
import type { User, PatientConnection } from "@shared/schema";

interface MeetingCardProps {
  meeting: PatientConnection & {
    requester?: User | null;
    target?: User | null;
    googleMeetLink?: string | null;
  };
  currentUserId: string;
  onJoin?: () => void;
  onJoinGoogleMeet?: (meetLink: string) => void;
  onCancel?: () => void;
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

export function MeetingCard({
  meeting,
  currentUserId,
  onJoin,
  onJoinGoogleMeet,
  onCancel,
  isLoading,
}: MeetingCardProps) {
  const otherUser = meeting.requesterPatientId === currentUserId 
    ? meeting.target 
    : meeting.requester;
  
  const scheduledAt = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const isPastMeeting = scheduledAt ? isPast(scheduledAt) : false;
  const isTodayMeeting = scheduledAt ? isToday(scheduledAt) : false;
  const canJoin = scheduledAt && isFuture(scheduledAt) && meeting.status === "CONFIRMED";

  return (
    <Card className="hover-elevate" data-testid={`card-meeting-${meeting.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-primary/10">
            <Calendar className="h-5 w-5 text-primary mb-0.5" />
            {scheduledAt && (
              <span className="text-xs font-semibold text-primary">
                {format(scheduledAt, "MMM d")}
              </span>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-foreground truncate">
                Meeting with {otherUser?.name || "Unknown"}
              </h4>
              {isPastMeeting ? (
                <StatusBadge status="completed" />
              ) : isTodayMeeting ? (
                <StatusBadge status="live" />
              ) : (
                <StatusBadge status="confirmed" />
              )}
            </div>
            
            {scheduledAt && (
              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{format(scheduledAt, "h:mm a")}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 mt-1">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px] bg-secondary">
                  {otherUser ? getInitials(otherUser.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">
                {otherUser?.name}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {canJoin && onJoinGoogleMeet && (
              <Button
                size="sm"
                onClick={() => onJoinGoogleMeet('')}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid={`button-join-google-meet-${meeting.id}`}
              >
                <Video className="h-4 w-4 mr-1" />
                Start Google Meet
              </Button>
            )}
            {canJoin && !meeting.googleMeetLink && onJoin && (
              <Button
                size="sm"
                onClick={onJoin}
                disabled={isLoading}
                data-testid={`button-join-${meeting.id}`}
              >
                <Phone className="h-4 w-4 mr-1" />
                Join Call
              </Button>
            )}
            
            {!isPastMeeting && onCancel && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={isLoading}
                data-testid={`button-cancel-meeting-${meeting.id}`}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

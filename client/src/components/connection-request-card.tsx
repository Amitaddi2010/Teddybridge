import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Check, X, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { User, PatientConnection } from "@shared/schema";

interface ConnectionRequestCardProps {
  connection: PatientConnection & {
    requester?: User | null;
    target?: User | null;
  };
  isIncoming: boolean;
  currentUserId: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onResend?: () => void;
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

export function ConnectionRequestCard({
  connection,
  isIncoming,
  currentUserId,
  onAccept,
  onDecline,
  onResend,
  onCancel,
  isLoading,
}: ConnectionRequestCardProps) {
  const otherUser = isIncoming ? connection.requester : connection.target;
  const status = connection.status.toLowerCase() as "pending" | "confirmed" | "declined";
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt) : null;
  const isExpired = expiresAt && expiresAt < new Date();

  return (
    <Card className="hover-elevate" data-testid={`card-connection-${connection.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold text-sm">
              {otherUser ? getInitials(otherUser.name) : "?"}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-foreground truncate">
                {otherUser?.name || connection.targetEmail || "Unknown"}
              </h4>
              <StatusBadge status={isExpired ? "declined" : status} />
            </div>
            
            <p className="text-xs text-muted-foreground mt-1">
              {isIncoming ? "Wants to connect with you" : "Invitation sent"}
              {connection.createdAt && (
                <> on {format(new Date(connection.createdAt), "MMM d, yyyy")}</>
              )}
            </p>
            
            {expiresAt && !isExpired && status === "pending" && (
              <p className="text-xs text-muted-foreground">
                Expires {format(expiresAt, "MMM d, yyyy")}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {isIncoming && status === "pending" && !isExpired && (
              <>
                <Button
                  size="sm"
                  onClick={onAccept}
                  disabled={isLoading}
                  data-testid={`button-accept-${connection.id}`}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDecline}
                  disabled={isLoading}
                  data-testid={`button-decline-${connection.id}`}
                >
                  <X className="h-4 w-4 mr-1" />
                  Decline
                </Button>
              </>
            )}
            
            {!isIncoming && status === "pending" && (
              <>
                {onResend && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onResend}
                    disabled={isLoading}
                    data-testid={`button-resend-${connection.id}`}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Resend
                  </Button>
                )}
                {onCancel && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={isLoading}
                    data-testid={`button-cancel-${connection.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

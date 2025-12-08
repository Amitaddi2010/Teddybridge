import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallViewProps {
  participantName: string;
  isConnecting?: boolean;
  onEndCall: () => void;
  onMuteToggle?: () => void;
  transcript?: string;
  aiSummary?: string;
  showTranscript?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function CallView({
  participantName,
  isConnecting = false,
  onEndCall,
  onMuteToggle,
  transcript,
  aiSummary,
  showTranscript = false,
}: CallViewProps) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!isConnecting) {
      const interval = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnecting]);

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    onMuteToggle?.();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex"
      data-testid="call-view"
    >
      <div className={cn(
        "flex-1 flex flex-col items-center justify-center",
        showTranscript && "lg:pr-96"
      )}>
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <Avatar className="h-32 w-32">
              <AvatarFallback className="text-4xl bg-primary/20 text-primary font-bold">
                {getInitials(participantName)}
              </AvatarFallback>
            </Avatar>
            {!isConnecting && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-background animate-pulse" />
            )}
          </div>
          
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground" data-testid="text-call-participant">
              {participantName}
            </h2>
            <p className="text-muted-foreground mt-1" data-testid="text-call-status">
              {isConnecting ? "Connecting..." : "In call"}
            </p>
          </div>
          
          <div className="text-5xl font-mono font-bold text-foreground" data-testid="text-call-duration">
            {formatDuration(duration)}
          </div>
          
          <div className="flex items-center gap-4 mt-8">
            <Button
              size="lg"
              variant={isMuted ? "destructive" : "secondary"}
              className="h-16 w-16 rounded-full"
              onClick={handleMuteToggle}
              data-testid="button-mute"
            >
              {isMuted ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
            
            <Button
              size="lg"
              variant="destructive"
              className="h-20 w-20 rounded-full"
              onClick={onEndCall}
              data-testid="button-end-call"
            >
              <PhoneOff className="h-8 w-8" />
            </Button>
          </div>
        </div>
      </div>
      
      {showTranscript && (
        <div className="hidden lg:flex w-96 border-l bg-card flex-col">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Live Transcript</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {transcript ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-transcript">
                {transcript}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Transcript will appear here...
              </p>
            )}
          </div>
          
          {aiSummary && (
            <div className="border-t p-4">
              <h4 className="font-medium text-sm mb-2">AI Summary</h4>
              <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">
                {aiSummary}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

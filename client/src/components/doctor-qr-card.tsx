import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { QrCode, Download, RefreshCw, Copy, Check } from "lucide-react";
import type { User, DoctorProfile } from "@shared/schema";

interface DoctorQrCardProps {
  doctor: User & { doctorProfile?: DoctorProfile | null };
  qrCodeUrl?: string;
  onGenerateQr?: () => void;
  onRefreshQr?: () => void;
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

export function DoctorQrCard({
  doctor,
  qrCodeUrl,
  onGenerateQr,
  onRefreshQr,
  isLoading,
}: DoctorQrCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (qrCodeUrl) {
      await navigator.clipboard.writeText(qrCodeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (qrCodeUrl) {
      const link = document.createElement("a");
      link.href = qrCodeUrl;
      link.download = `dr-${doctor.name.toLowerCase().replace(/\s+/g, "-")}-qr.png`;
      link.click();
    }
  };

  return (
    <Card data-testid="card-doctor-qr">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          Your QR Code
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {getInitials(doctor.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{doctor.name}</p>
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

        {qrCodeUrl ? (
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img
                src={qrCodeUrl}
                alt="QR Code for patient linking"
                className="w-48 h-48"
                data-testid="img-qr-code"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCopyLink}
                data-testid="button-copy-qr-link"
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
                onClick={handleDownload}
                data-testid="button-download-qr"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                onClick={onRefreshQr}
                disabled={isLoading}
                data-testid="button-refresh-qr"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Patients can scan this code to link to your profile
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <QrCode className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-4">
              Generate a QR code for patients to link with you
            </p>
            <Button onClick={onGenerateQr} disabled={isLoading} data-testid="button-generate-qr">
              Generate QR Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

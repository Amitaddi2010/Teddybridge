import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DoctorLinkCard } from "@/components/doctor-link-card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, AlertCircle, LogIn } from "lucide-react";
import type { User, DoctorProfile, LinkRecord } from "@shared/schema";

type DoctorWithProfile = User & { doctorProfile?: DoctorProfile | null };

export default function LinkPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data: doctorData, isLoading, error } = useQuery<{
    doctor: DoctorWithProfile;
    isLinked: boolean;
  }>({
    queryKey: ["/api/qr/verify", token],
    queryFn: async () => {
      const res = await fetch(`/api/qr/verify?token=${token}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Invalid or expired link");
      }
      return res.json();
    },
    enabled: !!token,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/qr/link", { token });
    },
    onSuccess: () => {
      toast({
        title: "Successfully linked!",
        description: `You are now connected with ${doctorData?.doctor.name}`,
      });
      navigate("/dashboard/patient");
    },
    onError: (error) => {
      toast({
        title: "Failed to link",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="w-full border-b">
          <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
            <Logo size="md" />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-2xl">
            <CardContent className="py-12">
              <div className="space-y-4">
                <Skeleton className="h-32 w-32 rounded-full mx-auto" />
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error || !doctorData) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="w-full border-b">
          <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-12">
              <AlertCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
              <h2 className="text-2xl font-bold mb-2">Invalid Link</h2>
              <p className="text-muted-foreground mb-6">
                {error instanceof Error ? error.message : "This link is invalid or has expired."}
              </p>
              <Link href="/">
                <Button data-testid="button-go-home">
                  Return to Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="w-full border-b">
          <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-12">
              <LogIn className="h-16 w-16 mx-auto text-primary mb-4" />
              <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
              <p className="text-muted-foreground mb-6">
                Please sign in as a patient to link with {doctorData.doctor.name}
              </p>
              <div className="flex flex-col gap-3">
                <Link href={`/login?redirect=/link/${token}`}>
                  <Button className="w-full" data-testid="button-login">
                    Sign In
                  </Button>
                </Link>
                <Link href={`/signup/patient?redirect=/link/${token}`}>
                  <Button variant="outline" className="w-full" data-testid="button-signup">
                    Create Patient Account
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (user.role !== "PATIENT") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="w-full border-b">
          <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-12">
              <AlertCircle className="h-16 w-16 mx-auto text-yellow-500 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Patient Account Required</h2>
              <p className="text-muted-foreground mb-6">
                Only patients can link to doctors. You are currently signed in as a doctor.
              </p>
              <Link href="/dashboard/doctor">
                <Button data-testid="button-go-dashboard">
                  Go to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="w-full border-b">
        <div className="max-w-7xl mx-auto px-6 flex h-16 items-center justify-between gap-4">
          <Link href="/dashboard/patient">
            <Button variant="ghost" size="sm" data-testid="link-back-dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <DoctorLinkCard
          doctor={doctorData.doctor}
          isAlreadyLinked={doctorData.isLinked}
          onLink={() => linkMutation.mutate()}
          isLoading={linkMutation.isPending}
        />
      </main>
    </div>
  );
}

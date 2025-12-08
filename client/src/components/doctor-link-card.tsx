import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Stethoscope, MapPin, Link as LinkIcon, CheckCircle, Shield } from "lucide-react";
import type { User, DoctorProfile } from "@shared/schema";

interface DoctorLinkCardProps {
  doctor: User & { doctorProfile?: DoctorProfile | null };
  isAlreadyLinked?: boolean;
  onLink: () => void;
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

export function DoctorLinkCard({
  doctor,
  isAlreadyLinked = false,
  onLink,
  isLoading,
}: DoctorLinkCardProps) {
  return (
    <Card className="max-w-2xl mx-auto" data-testid="card-doctor-link">
      <CardHeader className="text-center pb-2">
        <Avatar className="h-32 w-32 mx-auto mb-4">
          <AvatarFallback className="text-4xl bg-primary/10 text-primary font-bold">
            {getInitials(doctor.name)}
          </AvatarFallback>
        </Avatar>
        <CardTitle className="text-3xl" data-testid="text-doctor-name">
          {doctor.name}
        </CardTitle>
        {doctor.doctorProfile?.specialty && (
          <CardDescription className="flex items-center justify-center gap-1 text-base">
            <Stethoscope className="h-4 w-4" />
            {doctor.doctorProfile.specialty}
          </CardDescription>
        )}
        {doctor.doctorProfile?.city && (
          <CardDescription className="flex items-center justify-center gap-1">
            <MapPin className="h-4 w-4" />
            {doctor.doctorProfile.city}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-green-600" />
          HIPAA Compliant Healthcare Provider
        </div>

        {isAlreadyLinked ? (
          <div className="text-center py-6">
            <CheckCircle className="h-16 w-16 mx-auto text-green-600 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              You&apos;re already linked!
            </h3>
            <p className="text-muted-foreground">
              You are connected with {doctor.name}. Your healthcare information 
              can now be shared securely.
            </p>
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={onLink}
            disabled={isLoading}
            data-testid="button-link-doctor"
          >
            <LinkIcon className="h-5 w-5 mr-2" />
            Link to {doctor.name}
          </Button>
        )}

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="what-happens">
            <AccordionTrigger data-testid="accordion-what-happens">
              What happens when I link?
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  Your doctor can send you PROMS surveys for outcome tracking
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  You&apos;ll receive email notifications about your care journey
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  Your health data is encrypted and HIPAA compliant
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  No direct messaging or calls - just secure data sharing
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

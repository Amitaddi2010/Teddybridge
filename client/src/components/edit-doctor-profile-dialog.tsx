import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit } from "lucide-react";
import type { User, DoctorProfile } from "@shared/schema";

interface EditDoctorProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name?: string;
    phoneNumber?: string;
    specialty?: string;
    city?: string;
    education?: string;
    experience?: string;
    institution?: string;
    languages?: string;
    shortBio?: string;
    linkedinUrl?: string;
  }) => void;
  isLoading?: boolean;
  user?: (User & { doctorProfile?: DoctorProfile | null }) | null;
}

export function EditDoctorProfileDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  user,
}: EditDoctorProfileDialogProps) {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [education, setEducation] = useState("");
  const [experience, setExperience] = useState("");
  const [institution, setInstitution] = useState("");
  const [languages, setLanguages] = useState("");
  const [shortBio, setShortBio] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhoneNumber(user.doctorProfile?.phoneNumber || "");
      setSpecialty(user.doctorProfile?.specialty || "");
      setCity(user.doctorProfile?.city || "");
      setEducation(user.doctorProfile?.education || "");
      setExperience(user.doctorProfile?.experience || "");
      setInstitution(user.doctorProfile?.institution || "");
      setLanguages(user.doctorProfile?.languages || "");
      setShortBio(user.doctorProfile?.shortBio || "");
      setLinkedinUrl(user.doctorProfile?.linkedinUrl || "");
    }
  }, [user, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: {
      name?: string;
      phoneNumber?: string;
      specialty?: string;
      city?: string;
      education?: string;
      experience?: string;
      institution?: string;
      languages?: string;
      shortBio?: string;
      linkedinUrl?: string;
    } = {};
    
    if (name.trim()) {
      submitData.name = name.trim();
    }
    
    // Phone number is required for doctors, but allow empty string to be sent
    submitData.phoneNumber = phoneNumber.trim() || "";
    
    // Allow clearing optional fields
    submitData.specialty = specialty.trim() || null as any;
    submitData.city = city.trim() || null as any;
    submitData.education = education.trim() || null as any;
    submitData.experience = experience.trim() || null as any;
    submitData.institution = institution.trim() || null as any;
    submitData.languages = languages.trim() || null as any;
    submitData.shortBio = shortBio.trim() || null as any;
    submitData.linkedinUrl = linkedinUrl.trim() || null as any;
    
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-doctor-profile">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-primary" />
            Edit Profile
          </DialogTitle>
          <DialogDescription>
            Update your professional information and contact details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Dr. Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Contact Number *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                data-testid="input-phone"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="specialty">Specialty</Label>
                <Input
                  id="specialty"
                  type="text"
                  placeholder="e.g., Orthopedic Surgery, Cardiology"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  data-testid="input-specialty"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  type="text"
                  placeholder="e.g., Boston, MA"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  data-testid="input-city"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="education">Education</Label>
              <Input
                id="education"
                type="text"
                placeholder="e.g., MD, Harvard Medical School"
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                data-testid="input-education"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience">Experience</Label>
              <Input
                id="experience"
                type="text"
                placeholder="e.g., 15 years of experience in orthopedic surgery"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                data-testid="input-experience"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">Institution</Label>
              <Input
                id="institution"
                type="text"
                placeholder="e.g., Massachusetts General Hospital"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                data-testid="input-institution"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="languages">Languages</Label>
              <Input
                id="languages"
                type="text"
                placeholder="e.g., English, Spanish, French"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                data-testid="input-languages"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shortBio">Short Bio</Label>
              <Textarea
                id="shortBio"
                placeholder="Write a brief professional biography..."
                value={shortBio}
                onChange={(e) => setShortBio(e.target.value)}
                rows={4}
                data-testid="input-short-bio"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input
                id="linkedinUrl"
                type="url"
                placeholder="https://www.linkedin.com/in/yourprofile"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                data-testid="input-linkedin-url"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} data-testid="button-save-profile">
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


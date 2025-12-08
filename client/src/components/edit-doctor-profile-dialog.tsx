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

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhoneNumber(user.doctorProfile?.phoneNumber || "");
      setSpecialty(user.doctorProfile?.specialty || "");
      setCity(user.doctorProfile?.city || "");
    }
  }, [user, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: {
      name?: string;
      phoneNumber?: string;
      specialty?: string;
      city?: string;
    } = {};
    
    if (name.trim()) {
      submitData.name = name.trim();
    }
    
    // Phone number is required for doctors, but allow empty string to be sent
    submitData.phoneNumber = phoneNumber.trim() || "";
    
    // Allow clearing specialty and city
    submitData.specialty = specialty.trim() || null as any;
    submitData.city = city.trim() || null as any;
    
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-edit-doctor-profile">
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
              <Label htmlFor="phone">Phone Number</Label>
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


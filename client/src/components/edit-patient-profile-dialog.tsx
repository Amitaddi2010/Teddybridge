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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit } from "lucide-react";
import type { User, PatientProfile } from "@shared/schema";

interface EditPatientProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name?: string;
    phoneNumber?: string;
    demographics?: {
      age?: number;
      gender?: string;
      procedure?: string;
    };
  }) => void;
  isLoading?: boolean;
  user?: (User & { patientProfile?: PatientProfile | null }) | null;
}

export function EditPatientProfileDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  user,
}: EditPatientProfileDialogProps) {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [procedure, setProcedure] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhoneNumber(user.patientProfile?.phoneNumber || "");
      setAge(user.patientProfile?.demographics?.age?.toString() || "");
      setGender(user.patientProfile?.demographics?.gender || "");
      setProcedure(user.patientProfile?.demographics?.procedure || "");
    }
  }, [user, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: {
      name?: string;
      phoneNumber?: string | null;
      demographics?: {
        age?: number | null;
        gender?: string | null;
        procedure?: string | null;
      };
    } = {};
    
    // Always send name if it's provided
    if (name.trim()) {
      submitData.name = name.trim();
    }
    
    // Always send phoneNumber (can be null to clear)
    submitData.phoneNumber = phoneNumber.trim() || null;
    
    // Always send demographics object with all fields (backend will merge with existing)
    submitData.demographics = {};
    if (age) {
      const ageNum = parseInt(age, 10);
      if (!isNaN(ageNum)) {
        submitData.demographics.age = ageNum;
      } else {
        submitData.demographics.age = null;
      }
    } else {
      submitData.demographics.age = null;
    }
    
    submitData.demographics.gender = gender || null;
    submitData.demographics.procedure = procedure.trim() || null;
    
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-edit-patient-profile">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-primary" />
            Edit Profile
          </DialogTitle>
          <DialogDescription>
            Update your personal information and health details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your full name"
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
                data-testid="input-phone"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="Age"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  data-testid="input-age"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender" data-testid="select-gender">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="procedure">Procedure</Label>
              <Input
                id="procedure"
                type="text"
                placeholder="e.g., Knee Replacement, Hip Surgery"
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                data-testid="input-procedure"
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


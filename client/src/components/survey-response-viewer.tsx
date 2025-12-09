import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface SurveyResponseViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survey: {
    id: string;
    formName: string;
    when: "preop" | "postop" | "other";
    status: string;
    completedAt: Date | null;
    responseData?: Record<string, any> | null;
  } | null;
}

export function SurveyResponseViewer({ open, onOpenChange, survey }: SurveyResponseViewerProps) {
  if (!survey) return null;

  const renderField = (key: string, value: any) => {
    // Skip internal fields
    if (key.includes("_complete") || key.includes("_timestamp") || key === "record_id") {
      return null;
    }

    // Format field name (replace underscores with spaces, capitalize)
    const fieldName = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

    return (
      <div key={key} className="grid grid-cols-2 gap-4 py-2 border-b last:border-0">
        <div className="font-medium text-sm">{fieldName}</div>
        <div className="text-sm text-muted-foreground">
          {value === null || value === undefined || value === "" 
            ? <span className="text-muted-foreground italic">Not answered</span>
            : String(value)
          }
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{survey.formName}</span>
            <Badge variant={survey.status === "COMPLETED" ? "default" : "secondary"}>
              {survey.when === "preop" ? "Pre-Operative" : survey.when === "postop" ? "Post-Operative" : "General"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {survey.completedAt && `Completed on ${format(new Date(survey.completedAt), "PPP 'at' p")}`}
          </DialogDescription>
        </DialogHeader>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Survey Responses</CardTitle>
          </CardHeader>
          <CardContent>
            {survey.responseData ? (
              <div className="space-y-2">
                {Object.entries(survey.responseData)
                  .map(([key, value]) => renderField(key, value))
                  .filter(Boolean)}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No response data available</p>
                <p className="text-xs mt-2">Response data will appear here once the survey is completed</p>
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}


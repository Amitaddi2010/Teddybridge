import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send, Eye, FileText } from "lucide-react";
import { format } from "date-fns";
import type { SurveyRequest, User } from "@shared/schema";

interface PromsTableProps {
  surveys: (SurveyRequest & { patient?: User | null })[];
  onSendSurvey?: (patientId: string, type: "preop" | "postop") => void;
  onViewResponse?: (surveyId: string) => void;
  onGenerateReport?: (patientId: string) => void;
  isLoading?: boolean;
}

export function PromsTable({
  surveys,
  onSendSurvey,
  onViewResponse,
  onGenerateReport,
  isLoading,
}: PromsTableProps) {
  const patientSurveys = surveys.reduce((acc, survey) => {
    const patientId = survey.patientId;
    if (!acc[patientId]) {
      acc[patientId] = {
        patient: survey.patient,
        preop: null as SurveyRequest | null,
        postop: null as SurveyRequest | null,
      };
    }
    if (survey.when === "preop") {
      acc[patientId].preop = survey;
    } else if (survey.when === "postop") {
      acc[patientId].postop = survey;
    }
    return acc;
  }, {} as Record<string, { patient?: User | null; preop: SurveyRequest | null; postop: SurveyRequest | null }>);

  const renderSurveyAction = (
    survey: SurveyRequest | null,
    patientId: string,
    type: "preop" | "postop"
  ) => {
    if (!survey) {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSendSurvey?.(patientId, type)}
          disabled={isLoading}
          data-testid={`button-send-${type}-${patientId}`}
        >
          <Send className="h-3.5 w-3.5 mr-1" />
          Send
        </Button>
      );
    }

    const status = survey.status.toLowerCase() as "pending" | "sent" | "completed";

    if (status === "completed") {
      return (
        <div className="flex items-center gap-2">
          <StatusBadge status="completed" />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onViewResponse?.(survey.id)}
            data-testid={`button-view-${type}-${patientId}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return <StatusBadge status={status} />;
  };

  return (
    <div className="rounded-lg border bg-card" data-testid="table-proms">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient Name</TableHead>
            <TableHead className="text-center">Pre-Op</TableHead>
            <TableHead className="text-center">Post-Op</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(patientSurveys).length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                No PROMS data yet. Add patients to start tracking.
              </TableCell>
            </TableRow>
          ) : (
            Object.entries(patientSurveys).map(([patientId, data]) => (
              <TableRow key={patientId} data-testid={`row-patient-${patientId}`}>
                <TableCell className="font-medium">
                  {data.patient?.name || "Unknown Patient"}
                </TableCell>
                <TableCell className="text-center">
                  {renderSurveyAction(data.preop, patientId, "preop")}
                </TableCell>
                <TableCell className="text-center">
                  {renderSurveyAction(data.postop, patientId, "postop")}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onGenerateReport?.(patientId)}
                    disabled={isLoading || (!data.preop?.status && !data.postop?.status)}
                    data-testid={`button-report-${patientId}`}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Report
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

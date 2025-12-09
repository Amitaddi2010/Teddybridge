import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  ClipboardCheck, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  BarChart3
} from "lucide-react";

interface SurveyAnalyticsProps {
  totalSurveys: number;
  completedSurveys: number;
  pendingSurveys: number;
  preopCount: number;
  postopCount: number;
  completionRate: number;
  averageCompletionTime: number | null; // in milliseconds
}

export function SurveyAnalytics({
  totalSurveys,
  completedSurveys,
  pendingSurveys,
  preopCount,
  postopCount,
  completionRate,
  averageCompletionTime,
}: SurveyAnalyticsProps) {
  const formatTime = (ms: number | null) => {
    if (!ms) return "N/A";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    const minutes = Math.floor(ms / (1000 * 60));
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Surveys</CardTitle>
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalSurveys}</div>
          <p className="text-xs text-muted-foreground">
            {preopCount} Pre-Op, {postopCount} Post-Op
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completionRate.toFixed(1)}%</div>
          <Progress value={completionRate} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {completedSurveys} of {totalSurveys} completed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Surveys</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pendingSurveys}</div>
          <p className="text-xs text-muted-foreground">
            Awaiting patient completion
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg. Completion Time</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatTime(averageCompletionTime)}</div>
          <p className="text-xs text-muted-foreground">
            Time from send to completion
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


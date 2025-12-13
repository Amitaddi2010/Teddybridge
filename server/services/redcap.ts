/**
 * Professional REDCap API Service
 * Based on REDCap API v2.11.4 capabilities
 * https://cran.r-project.org/web/packages/redcapAPI/redcapAPI.pdf
 */

interface RedcapApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface RedcapRecord {
  record_id?: string;
  [key: string]: any;
}

interface RedcapMetadata {
  field_name: string;
  form_name: string;
  field_type: string;
  field_label: string;
  [key: string]: any;
}

interface RedcapSurveyParticipant {
  email: string;
  firstname?: string;
  lastname?: string;
  identifier?: string;
}

export class RedcapService {
  private _apiUrl?: string;
  private _apiKey?: string;
  private _projectId?: string;
  private _initialized = false;

  /**
   * Lazy-load environment variables (called after dotenv.config())
   */
  private initialize() {
    if (this._initialized) return;
    
    this._apiUrl = process.env.REDCAP_API_URL || "";
    this._apiKey = process.env.REDCAP_API_KEY || "";
    this._projectId = process.env.REDCAP_PROJECT_ID;
    this._initialized = true;
    
    // Debug logging for REDCap configuration
    console.log("\n=== REDCap Initialization ===");
    console.log(`  REDCAP_API_URL: ${this._apiUrl ? `${this._apiUrl.substring(0, 30)}...` : 'NOT SET'}`);
    console.log(`  REDCAP_API_KEY: ${this._apiKey ? `${this._apiKey.substring(0, 8)}...` : 'NOT SET'}`);
    console.log(`  REDCAP_PROJECT_ID: ${this._projectId || 'NOT SET'}`);
    console.log(`  REDCap Configured: ${this.isConfigured() ? '✓ YES' : '✗ NO'}`);
    console.log("============================\n");
  }

  /**
   * Get API URL (lazy-loaded)
   */
  private getApiUrl(): string {
    this.initialize();
    return this._apiUrl || "";
  }

  /**
   * Get API Key (lazy-loaded)
   */
  private getApiKey(): string {
    this.initialize();
    return this._apiKey || "";
  }

  /**
   * Get Project ID (lazy-loaded)
   */
  private getProjectId(): string | undefined {
    this.initialize();
    return this._projectId;
  }

  /**
   * Check if REDCap API is properly configured
   */
  isConfigured(): boolean {
    this.initialize();
    return !!(this._apiUrl && this._apiKey);
  }

  /**
   * Make a REDCap API call
   */
  private async makeApiCall(
    content: string,
    data: Record<string, any> = {}
  ): Promise<RedcapApiResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: "REDCap API not configured. Missing REDCAP_API_URL or REDCAP_API_KEY",
      };
    }

    try {
      const formData = new FormData();
      formData.append("token", this.getApiKey());
      formData.append("content", content);
      formData.append("format", "json");
      formData.append("returnFormat", "json");

      // Add additional data fields
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value));
          } else if (typeof value === "object") {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });

      const response = await fetch(this.getApiUrl(), {
        method: "POST",
        body: formData,
        // Increase timeout for REDCap API calls (30 seconds)
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `REDCap API error: ${response.status} - ${errorText}`,
        };
      }

      const result = await response.json();

      // REDCap returns error as string in some cases
      if (typeof result === "string" && result.includes("ERROR")) {
        return {
          success: false,
          error: result,
        };
      }

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      console.error("REDCap API call failed:", error);
      return {
        success: false,
        error: error.message || "Unknown error occurred",
      };
    }
  }

  /**
   * Export records (survey responses)
   * Equivalent to exportRecords in redcapAPI
   */
  async exportRecords(
    recordIds?: string[],
    fields?: string[],
    forms?: string[],
    events?: string[]
  ): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {};

    if (recordIds && recordIds.length > 0) {
      data.records = recordIds;
    }

    if (fields && fields.length > 0) {
      data.fields = fields;
    }

    if (forms && forms.length > 0) {
      data.forms = forms;
    }

    if (events && events.length > 0) {
      data.events = events;
    }

    return this.makeApiCall("record", data);
  }

  /**
   * Export metadata (data dictionary)
   * Equivalent to exportMetaData in redcapAPI
   */
  async exportMetadata(forms?: string[]): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {};

    if (forms && forms.length > 0) {
      data.forms = forms;
    }

    return this.makeApiCall("metadata", data);
  }

  /**
   * Import records (create or update survey responses)
   * Equivalent to importRecords in redcapAPI
   */
  async importRecords(records: RedcapRecord[]): Promise<RedcapApiResponse> {
    if (!records || records.length === 0) {
      return {
        success: false,
        error: "No records provided",
      };
    }

    return this.makeApiCall("record", {
      data: JSON.stringify(records),
      overwriteBehavior: "normal", // or "overwrite"
      returnContent: "ids", // or "count" or "auto_ids"
    });
  }

  /**
   * Export survey participants
   * Equivalent to exportSurveyParticipants in redcapAPI
   */
  async exportSurveyParticipants(
    instrument: string,
    event?: string
  ): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {
      instrument,
    };

    if (event) {
      data.event = event;
    }

    return this.makeApiCall("participantList", data);
  }

  /**
   * Import survey participants (invite participants to survey)
   * Equivalent to importSurveyParticipants in redcapAPI
   */
  async importSurveyParticipants(
    instrument: string,
    participants: RedcapSurveyParticipant[],
    event?: string
  ): Promise<RedcapApiResponse> {
    if (!participants || participants.length === 0) {
      return {
        success: false,
        error: "No participants provided",
      };
    }

    const data: Record<string, any> = {
      instrument,
      data: JSON.stringify(participants),
    };

    if (event) {
      data.event = event;
    }

    return this.makeApiCall("participantList", data);
  }

  /**
   * Export survey link for a specific record
   * Equivalent to exportSurveyLink in redcapAPI
   */
  async exportSurveyLink(
    recordId: string,
    instrument: string,
    event?: string,
    returnFormat: "survey" | "hash" = "survey"
  ): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {
      record: recordId,
      instrument,
      returnFormat,
    };

    if (event) {
      data.event = event;
    }

    return this.makeApiCall("surveyLink", data);
  }

  /**
   * Export survey queue link
   * Equivalent to exportSurveyQueueLink in redcapAPI
   */
  async exportSurveyQueueLink(
    recordId: string,
    event?: string
  ): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {
      record: recordId,
    };

    if (event) {
      data.event = event;
    }

    return this.makeApiCall("surveyQueueLink", data);
  }

  /**
   * Check if a survey is completed for a specific record
   */
  async checkSurveyCompletion(
    recordId: string,
    instrument: string,
    event?: string
  ): Promise<{ completed: boolean; completionTime?: string }> {
    try {
      // Export records to check completion status
      const response = await this.exportRecords([recordId], undefined, [instrument], event ? [event] : undefined);

      if (!response.success) {
        console.error(`[REDCap] Failed to export records for ${recordId}:`, response.error);
        return { completed: false };
      }

      if (!response.data || response.data.length === 0) {
        console.log(`[REDCap] No data returned for record ${recordId}`);
        return { completed: false };
      }

      const record = response.data[0];
      const completionField = `${instrument}_complete`;

      // Log for debugging
      console.log(`[REDCap] Checking completion for record ${recordId}, instrument: ${instrument}`);
      console.log(`[REDCap] Completion field: ${completionField}, value: ${record[completionField]}`);
      console.log(`[REDCap] Record keys:`, Object.keys(record).slice(0, 20)); // First 20 keys
      const completionFields = Object.keys(record).filter(k => k.toLowerCase().includes('complete'));
      console.log(`[REDCap] Available completion fields:`, completionFields);

      // Check if completion field exists and is marked as complete
      // REDCap uses "2" for Complete, "1" for Incomplete, "0" for Not Started
      const completionValue = record[completionField];
      let isComplete = completionValue === "2" || completionValue === 2 || completionValue === "Complete";

      // If the standard field doesn't exist or isn't complete, check alternative formats
      if (!isComplete && completionFields.length > 0) {
        // Try other completion field formats
        for (const field of completionFields) {
          const value = record[field];
          if (value === "2" || value === 2 || value === "Complete") {
            console.log(`[REDCap] Found completion in alternative field: ${field}`);
            isComplete = true;
            break;
          }
        }
      }

      // Also check for timestamp field which indicates completion
      if (!isComplete) {
        const timestampField = `${instrument}_timestamp`;
        if (record[timestampField]) {
          console.log(`[REDCap] Found timestamp field ${timestampField}, considering as completed`);
          isComplete = true;
        }
      }

      // If still not complete, check if record has any data (might indicate partial completion)
      // But we'll be conservative and only mark as complete if we have explicit indicators
      
      const result = {
        completed: isComplete,
        completionTime: isComplete ? (record[`${instrument}_timestamp`] || new Date().toISOString()) : undefined,
      };

      console.log(`[REDCap] Final completion status for ${recordId}:`, result);
      return result;
    } catch (error: any) {
      console.error("Error checking survey completion:", error);
      return { completed: false };
    }
  }

  /**
   * Get survey response data for a specific record
   */
  async getSurveyResponse(
    recordId: string,
    instrument: string,
    event?: string
  ): Promise<RedcapApiResponse> {
    return this.exportRecords([recordId], undefined, [instrument], event ? [event] : undefined);
  }

  /**
   * Export project information
   */
  async exportProjectInfo(): Promise<RedcapApiResponse> {
    return this.makeApiCall("project");
  }

  /**
   * Export instruments (forms/surveys)
   * Equivalent to exportInstruments in redcapAPI
   */
  async exportInstruments(): Promise<RedcapApiResponse> {
    return this.makeApiCall("instrument");
  }

  /**
   * Export events (for longitudinal projects)
   */
  async exportEvents(): Promise<RedcapApiResponse> {
    return this.makeApiCall("event");
  }

  /**
   * Export reports
   */
  async exportReport(reportId: string): Promise<RedcapApiResponse> {
    return this.makeApiCall("report", { report_id: reportId });
  }

  /**
   * Export file (download uploaded file)
   */
  async exportFile(
    recordId: string,
    fieldName: string,
    event?: string
  ): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {
      record: recordId,
      field: fieldName,
    };

    if (event) {
      data.event = event;
    }

    return this.makeApiCall("file", data);
  }

  /**
   * Export logging (audit trail)
   * Equivalent to exportLogging in redcapAPI
   */
  async exportLogging(
    recordId?: string,
    beginTime?: string,
    endTime?: string,
    user?: string
  ): Promise<RedcapApiResponse> {
    const data: Record<string, any> = {};

    if (recordId) {
      data.record = recordId;
    }

    if (beginTime) {
      data.beginTime = beginTime;
    }

    if (endTime) {
      data.endTime = endTime;
    }

    if (user) {
      data.user = user;
    }

    return this.makeApiCall("log", data);
  }
}

// Export singleton instance
export const redcapService = new RedcapService();


/**
 * Groq AI Integration for Summary Generation
 */

export interface DoctorInfo {
  name: string;
  specialty?: string | null;
  institution?: string | null;
  shortBio?: string | null;
  education?: string | null;
}

export interface GroqSummaryRequest {
  transcript: string;
  callDuration?: number;
  callerName?: string;
  calleeName?: string;
  callerInfo?: DoctorInfo;
  calleeInfo?: DoctorInfo;
}

export interface GroqSummaryResponse {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

export class GroqService {
  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1';

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  GROQ_API_KEY not set. Summary generation will not work.');
    }
  }

  /**
   * Generate a summary from a call transcript
   */
  async generateSummary(request: GroqSummaryRequest): Promise<GroqSummaryResponse> {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    const prompt = this.buildPrompt(request);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // Using GPT-OSS-120B model
        messages: [
          {
            role: 'system',
            content: 'You are a medical documentation assistant. Generate concise, professional summaries of doctor-to-doctor consultations. CRITICALLY IMPORTANT: Always correctly attribute information to the correct doctor based on the participant information provided. Never mix up or swap information between doctors. If participant profiles are provided, use them to ensure accurate attribution of research focus, departments, institutions, and specialties. Focus on key medical information, decisions made, and action items. Do not include any patient-identifying information unless necessary for medical context.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Groq API error: ${errorText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.code === 'invalid_api_key') {
          errorMessage = `Invalid Groq API key. Please check your GROQ_API_KEY environment variable. The API key should start with "gsk_".`;
        } else if (errorJson.error?.message) {
          errorMessage = `Groq API error: ${errorJson.error.message}`;
        }
      } catch {
        // If parsing fails, use the original error text
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // Parse the response to extract structured data
    return this.parseSummaryResponse(content);
  }

  private buildPrompt(request: GroqSummaryRequest): string {
    let prompt = `Please generate a professional medical consultation summary from the following transcript.\n\n`;

    // Add detailed participant information with clear attribution
    prompt += `PARTICIPANTS:\n`;
    prompt += `=============\n\n`;
    
    // Caller information
    prompt += `CALLER (initiated the call):\n`;
    prompt += `- Name: ${request.callerName || "Unknown"}\n`;
    if (request.callerInfo) {
      if (request.callerInfo.specialty) {
        prompt += `- Specialty/Department: ${request.callerInfo.specialty}\n`;
      }
      if (request.callerInfo.institution) {
        prompt += `- Institution: ${request.callerInfo.institution}\n`;
      }
      if (request.callerInfo.education) {
        prompt += `- Education: ${request.callerInfo.education}\n`;
      }
      if (request.callerInfo.shortBio) {
        prompt += `- Background: ${request.callerInfo.shortBio}\n`;
      }
    }
    prompt += `\n`;
    
    // Callee information
    prompt += `CALLEE (received the call):\n`;
    prompt += `- Name: ${request.calleeName || "Unknown"}\n`;
    if (request.calleeInfo) {
      if (request.calleeInfo.specialty) {
        prompt += `- Specialty/Department: ${request.calleeInfo.specialty}\n`;
      }
      if (request.calleeInfo.institution) {
        prompt += `- Institution: ${request.calleeInfo.institution}\n`;
      }
      if (request.calleeInfo.education) {
        prompt += `- Education: ${request.calleeInfo.education}\n`;
      }
      if (request.calleeInfo.shortBio) {
        prompt += `- Background: ${request.calleeInfo.shortBio}\n`;
      }
    }
    prompt += `\n`;

    if (request.callDuration) {
      prompt += `Call Duration: ${Math.floor(request.callDuration / 60)} minutes\n\n`;
    }

    prompt += `TRANSCRIPT:\n`;
    prompt += `===========\n`;
    prompt += `${request.transcript}\n\n`;

    prompt += `IMPORTANT INSTRUCTIONS:\n`;
    prompt += `======================\n`;
    prompt += `1. When attributing information in the summary, ALWAYS correctly associate:\n`;
    prompt += `   - Information about ${request.callerInfo?.specialty || "the caller's specialty"} belongs to ${request.callerName || "the Caller"}\n`;
    prompt += `   - Information about ${request.calleeInfo?.specialty || "the callee's specialty"} belongs to ${request.calleeName || "the Callee"}\n`;
    prompt += `2. Do NOT mix up or swap information between the two doctors.\n`;
    prompt += `3. If the transcript mentions research focus, departments, or institutions, attribute them to the correct doctor based on the participant information above.\n`;
    prompt += `4. Be precise in identifying which doctor said what based on their names and profile information.\n\n`;

    prompt += `Please provide:\n`;
    prompt += `1. A concise executive summary (2-3 paragraphs) - ensure correct attribution of information to each doctor\n`;
    prompt += `2. Key points discussed (bullet list) - clearly indicate which doctor contributed each point\n`;
    prompt += `3. Action items or follow-ups (bullet list)\n\n`;

    prompt += `Format your response as JSON with the following structure:\n`;
    prompt += `{\n`;
    prompt += `  "summary": "Executive summary text here with correct doctor attribution",\n`;
    prompt += `  "keyPoints": ["Point 1", "Point 2", ...],\n`;
    prompt += `  "actionItems": ["Action 1", "Action 2", ...]\n`;
    prompt += `}`;

    return prompt;
  }

  private parseSummaryResponse(content: string): GroqSummaryResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || content,
          keyPoints: parsed.keyPoints || [],
          actionItems: parsed.actionItems || [],
        };
      }
    } catch (error) {
      console.warn('Failed to parse Groq response as JSON, using full text as summary');
    }

    // Fallback: use the entire response as summary
    return {
      summary: content,
      keyPoints: [],
      actionItems: [],
    };
  }
}

export const groqService = new GroqService();


/**
 * Groq AI Integration for Summary Generation
 */

export interface GroqSummaryRequest {
  transcript: string;
  callDuration?: number;
  callerName?: string;
  calleeName?: string;
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
            content: 'You are a medical documentation assistant. Generate concise, professional summaries of doctor-to-doctor consultations. Focus on key medical information, decisions made, and action items. Do not include any patient-identifying information unless necessary for medical context.',
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

    if (request.callerName && request.calleeName) {
      prompt += `Participants: ${request.callerName} (Caller) and ${request.calleeName} (Callee)\n`;
    }

    if (request.callDuration) {
      prompt += `Call Duration: ${Math.floor(request.callDuration / 60)} minutes\n`;
    }

    prompt += `\nTranscript:\n${request.transcript}\n\n`;

    prompt += `Please provide:
1. A concise executive summary (2-3 paragraphs)
2. Key points discussed (bullet list)
3. Action items or follow-ups (bullet list)

Format your response as JSON with the following structure:
{
  "summary": "Executive summary text here",
  "keyPoints": ["Point 1", "Point 2", ...],
  "actionItems": ["Action 1", "Action 2", ...]
}`;

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


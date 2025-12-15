/**
 * Assembly AI Integration for Transcription
 */

export interface AssemblyAITranscriptResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: string;
  }>;
  error?: string;
}

export class AssemblyAIService {
  private baseUrl = 'https://api.assemblyai.com/v2';

  private get apiKey(): string {
    // Read API key dynamically to ensure it's loaded from .env
    return process.env.ASSEMBLY_AI_API_KEY || '';
  }

  /**
   * Upload audio file to Assembly AI and get upload URL
   * Retries up to 3 times on network errors
   */
  async uploadAudio(audioBuffer: Buffer, retries = 3): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Assembly AI API key not configured');
    }

    console.log(`Uploading audio buffer to Assembly AI (size: ${audioBuffer.length} bytes, attempt ${4 - retries}/3)...`);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Create AbortController for timeout
        // Use 30 seconds for connection timeout (fetch default is 10s, we'll use longer)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout for upload

        // First, upload the file
        // Note: Node.js fetch has a default 10s connection timeout
        // We'll rely on the AbortController for our custom timeout
        const uploadResponse = await fetch(`${this.baseUrl}/upload`, {
          method: 'POST',
          headers: {
            'authorization': this.apiKey,
            'Content-Type': 'application/octet-stream',
          },
          body: audioBuffer,
          signal: controller.signal,
          // Note: Node.js fetch doesn't support connectTimeout option directly
          // The timeout is handled by AbortController above
        });

        clearTimeout(timeoutId);

        if (!uploadResponse.ok) {
          const error = await uploadResponse.text();
          throw new Error(`Assembly AI upload error: ${error}`);
        }

        const uploadData = await uploadResponse.json();
        console.log(`Upload successful, got upload URL: ${uploadData.upload_url}`);
        return uploadData.upload_url;
      } catch (error: any) {
        const isLastAttempt = attempt === retries - 1;
        const isTimeoutError = error.name === 'AbortError' || 
                              error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                              error.message?.includes('timeout') ||
                              error.message?.includes('Connect Timeout');
        
        if (isTimeoutError) {
          if (isLastAttempt) {
            // Don't log as error - this is a network issue, not a code issue
            // The frontend will fallback to browser STT
            throw new Error('Assembly AI connection timeout. Please use browser STT or check your network connection.');
          }
          // Only log retry attempts, not as errors
          console.log(`Upload attempt ${attempt + 1} timed out, retrying...`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
          continue;
        }
        
        // For other errors, throw immediately
        throw error;
      }
    }

    throw new Error('Failed to upload audio after multiple attempts');
  }

  /**
   * Submit a recording URL for transcription
   * If the URL requires authentication, use uploadAudio instead
   */
  async submitTranscription(audioUrl: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Assembly AI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/transcript`, {
      method: 'POST',
      headers: {
        'authorization': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true, // Enable speaker diarization
        auto_chapters: true,
        sentiment_analysis: false,
        entity_detection: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Assembly AI error: ${error}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Submit audio buffer for transcription (uploads first, then transcribes)
   */
  async submitTranscriptionFromBuffer(audioBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Assembly AI API key not configured');
    }

    // Upload the audio file first
    const uploadUrl = await this.uploadAudio(audioBuffer);
    
    // Then submit for transcription using the upload URL
    return this.submitTranscription(uploadUrl);
  }

  /**
   * Get transcription status and result
   */
  async getTranscription(transcriptId: string): Promise<AssemblyAITranscriptResponse> {
    if (!this.apiKey) {
      throw new Error('Assembly AI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
      headers: {
        'authorization': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Assembly AI error: ${error}`);
    }

    return await response.json();
  }

  /**
   * Format transcript with speaker labels
   */
  private formatTranscriptWithSpeakers(transcript: AssemblyAITranscriptResponse): string {
    if (!transcript.words || transcript.words.length === 0) {
      // Fallback to plain text if words array is not available
      return transcript.text || '';
    }

    // Group words by speaker and format
    let formatted = '';
    let currentSpeaker: string | undefined = undefined;
    
    for (const word of transcript.words) {
      if (word.speaker && word.speaker !== currentSpeaker) {
        // New speaker detected
        if (currentSpeaker !== undefined) {
          formatted += '\n'; // Add line break between speakers
        }
        formatted += `[${word.speaker}]: `;
        currentSpeaker = word.speaker;
      }
      formatted += word.text + ' ';
    }

    return formatted.trim();
  }

  /**
   * Poll for transcription completion
   */
  async waitForTranscription(transcriptId: string, maxWaitTime = 300000): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxWaitTime) {
      const transcript = await this.getTranscription(transcriptId);

      if (transcript.status === 'completed' && transcript.text) {
        // Format transcript with speaker labels if available
        return this.formatTranscriptWithSpeakers(transcript);
      }

      if (transcript.status === 'error') {
        throw new Error(`Transcription failed: ${transcript.error || 'Unknown error'}`);
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Transcription timeout');
  }
}

export const assemblyAIService = new AssemblyAIService();


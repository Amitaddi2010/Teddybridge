/**
 * Speech-to-Text and Text-to-Speech Services
 * Uses AssemblyAI for STT (Groq doesn't provide STT services)
 * Uses Groq TTS API for natural voice synthesis
 */

import { assemblyAIService } from './assemblyai';

export class SpeechService {
  private get groqApiKey(): string {
    return process.env.GROQ_API_KEY || '';
  }

  private get assemblyApiKey(): string {
    return process.env.ASSEMBLY_AI_API_KEY || '';
  }

  private get baseUrl(): string {
    return 'https://api.groq.com/openai/v1';
  }

  isConfigured(): boolean {
    return !!this.groqApiKey && !!this.assemblyApiKey;
  }

  isTTSConfigured(): boolean {
    return !!this.groqApiKey;
  }

  isSTTConfigured(): boolean {
    return !!this.assemblyApiKey;
  }

  /**
   * Convert speech audio to text using AssemblyAI
   */
  async speechToText(audioBuffer: Buffer): Promise<string> {
    if (!this.isSTTConfigured()) {
      throw new Error('AssemblyAI API key not configured. Please set ASSEMBLY_AI_API_KEY in environment variables.');
    }

    try {
      // Upload audio buffer to AssemblyAI
      const uploadUrl = await assemblyAIService.uploadAudio(audioBuffer);
      
      // Submit for transcription
      const transcriptId = await assemblyAIService.submitTranscription(uploadUrl);
      
      // Wait for transcription to complete (with timeout)
      // waitForTranscription returns a formatted string directly
      const transcriptText = await assemblyAIService.waitForTranscription(transcriptId, 30000); // 30 seconds timeout for real-time
      
      // Remove speaker labels for clean text (format is [SPEAKER_00]: text)
      const cleanText = transcriptText.replace(/\[SPEAKER_\d+\]:\s*/gi, '').trim();
      
      return cleanText || transcriptText;
    } catch (error: any) {
      // Only log unexpected errors (connection timeouts are network issues)
      const isTimeoutError = error.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                            error.message?.includes('timeout') ||
                            error.message?.includes('Connect Timeout');
      
      if (!isTimeoutError) {
        console.error('Error in speech-to-text:', error);
      } else {
        // Log timeout as warning, not error (network issue, not code issue)
        console.warn('AssemblyAI connection timeout - will fallback to browser STT');
      }
      throw error;
    }
  }

  /**
   * Convert text to speech audio using Groq TTS API
   * Returns audio data as ArrayBuffer
   * Available voices: Arista-PlayAI, Atlas-PlayAI, Basil-PlayAI, Briggs-PlayAI, Calum-PlayAI,
   * Celeste-PlayAI, Cheyenne-PlayAI, Chip-PlayAI, Cillian-PlayAI, Deedee-PlayAI, Fritz-PlayAI,
   * Gail-PlayAI, Indigo-PlayAI, Judy-PlayAI, Mamaw-PlayAI, Mason-PlayAI, Mikail-PlayAI, 
   * Mitch-PlayAI, Quinn-PlayAI, Thunder-PlayAI
   */
  async textToSpeech(text: string, voice: string = 'Fritz-PlayAI'): Promise<ArrayBuffer> {
    if (!this.isTTSConfigured()) {
      throw new Error('Groq API key not configured. Please set GROQ_API_KEY in environment variables.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'playai-tts',
          input: text,
          voice: voice,
          response_format: 'wav',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Groq TTS error: ${response.status} - ${errorText}`;
        let errorCode: string | undefined;
        
        // Handle specific error cases
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.code === 'model_terms_required') {
            errorMessage = `Groq TTS model requires terms acceptance. Please accept the terms at https://console.groq.com/playground?model=playai-tts and try again.`;
            errorCode = 'MODEL_TERMS_REQUIRED';
          } else if (errorJson.error?.message) {
            errorMessage = `Groq TTS error: ${errorJson.error.message}`;
            errorCode = errorJson.error?.code;
          }
        } catch {
          // If error is not JSON, use the original error text
        }
        
        const error: any = new Error(errorMessage);
        error.code = errorCode;
        error.status = response.status;
        throw error;
      }

      return await response.arrayBuffer();
    } catch (error: any) {
      // Only log unexpected errors (not terms acceptance which is expected)
      if (error.code !== 'MODEL_TERMS_REQUIRED') {
        console.error('Error in text-to-speech:', error);
      }
      throw error;
    }
  }
}

export const speechService = new SpeechService();


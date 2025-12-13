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

/**
 * Map speaker labels to doctor names by analyzing transcript content
 */
function mapSpeakersToDoctors(
  transcript: string,
  callerName: string,
  calleeName: string,
  callerInfo?: DoctorInfo,
  calleeInfo?: DoctorInfo
): Map<string, string> {
  const speakerMap = new Map<string, string>();
  
  // Extract unique speaker labels from transcript
  const speakerLabelRegex = /\[(Speaker [A-Z]|SPEAKER_[0-9]+)\]:/gi;
  const speakerLabels = new Set<string>();
  let match;
  while ((match = speakerLabelRegex.exec(transcript)) !== null) {
    speakerLabels.add(match[1]);
  }
  
  const speakers = Array.from(speakerLabels);
  if (speakers.length < 2) {
    // Can't map if we don't have 2 speakers
    return speakerMap;
  }
  
  // Create scoring system for each speaker
  const speakerScores: Record<string, { callerScore: number; calleeScore: number }> = {};
  
  for (const speaker of speakers) {
    speakerScores[speaker] = { callerScore: 0, calleeScore: 0 };
  }
  
  // Extract text segments for each speaker
  const speakerSegments: Record<string, string[]> = {};
  for (const speaker of speakers) {
    speakerSegments[speaker] = [];
  }
  
  const lines = transcript.split('\n');
  let currentSpeaker: string | null = null;
  
  for (const line of lines) {
    const speakerMatch = line.match(/\[(Speaker [A-Z]|SPEAKER_[0-9]+)\]:/i);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1];
    } else if (currentSpeaker && line.trim()) {
      speakerSegments[currentSpeaker].push(line.trim());
    }
  }
  
  // Analyze each speaker's statements
  for (const speaker of speakers) {
    const segments = speakerSegments[speaker].join(' ').toLowerCase();
    const originalText = speakerSegments[speaker].join(' '); // Keep original case for better matching
    
    console.log(`\n=== Analyzing ${speaker} ===`);
    console.log(`Sample text: ${originalText.substring(0, 200)}...`);
    
    // CRITICAL: Check for self-location statements FIRST (most reliable indicator)
    // Pattern: "I have come to X", "I am at X", "I'm at X", "I am calling from X", "I am in X", "I'm in X"
    const selfLocationPatterns = [
      /i\s+(?:have\s+come\s+to|am\s+at|'m\s+at)\s+([^,.!?]+?)(?:[,.!?]|$|and|to|for|before|after|to\s+check)/gi,
      /i\s+(?:am|'m)\s+in\s+(?:the\s+)?([^,.!?]+?)(?:[,.!?]|$|and|to|for|before|after)/gi,
      /i\s+(?:am|'m)\s+calling\s+from\s+([^,.!?]+?)(?:[,.!?]|$|and|to|for)/gi,
      /(?:sitting|working|located)\s+(?:at|in)\s+([^,.!?]+?)(?:[,.!?]|$|and|to|for)/gi,
    ];
    
    for (const pattern of selfLocationPatterns) {
      let match;
      while ((match = pattern.exec(segments)) !== null) {
        const locationText = match[1].trim();
        console.log(`  Found self-location: "${locationText}"`);
        
        // Check against caller's institution
        if (callerInfo?.institution) {
          const institutionLower = callerInfo.institution.toLowerCase();
          const institutionWords = institutionLower.split(/\s+/).filter(w => w.length > 2);
          let matchCount = 0;
          for (const word of institutionWords) {
            if (locationText.includes(word)) {
              matchCount++;
              console.log(`    Matches caller institution word: "${word}"`);
            }
          }
          // If most words match, this is likely the caller
          if (matchCount >= Math.min(2, institutionWords.length)) {
            speakerScores[speaker].callerScore += 50; // Very high score for self-location
            console.log(`    -> STRONG match for CALLER (${callerInfo.institution}): +50 points`);
          }
        }
        
        // Check against callee's institution
        if (calleeInfo?.institution) {
          const institutionLower = calleeInfo.institution.toLowerCase();
          const institutionWords = institutionLower.split(/\s+/).filter(w => w.length > 2);
          let matchCount = 0;
          for (const word of institutionWords) {
            if (locationText.includes(word)) {
              matchCount++;
              console.log(`    Matches callee institution word: "${word}"`);
            }
          }
          // If most words match, this is likely the callee
          if (matchCount >= Math.min(2, institutionWords.length)) {
            speakerScores[speaker].calleeScore += 50; // Very high score for self-location
            console.log(`    -> STRONG match for CALLEE (${calleeInfo.institution}): +50 points`);
          }
        }
        
        // Special check for "lab" or "laboratory" - if someone says "in lab" they're likely not at a university
        if (locationText.includes('lab') || locationText.includes('laboratory')) {
          console.log(`    Found lab/laboratory mention`);
          // Give points for lab mention, but this needs to be combined with other signals
          if (!locationText.includes('university') && !locationText.includes('punjab')) {
            // If they say "in lab" but not "in lab at university", they're probably in a lab elsewhere
            speakerScores[speaker].callerScore += 20;
            speakerScores[speaker].calleeScore += 20;
          }
        }
      }
    }
    
    // Additional check for responses to "where are you" type questions
    // Pattern: Question about location followed by answer
    if (segments.includes('where are you') || segments.includes('where are you sitting') || 
        segments.includes('where are you working')) {
      // The speaker being asked is likely the one who responds
      // Look for responses like "in lab", "in the lab", "at department", etc.
      const responsePattern = /(?:yeah|yes|i'm|i am|sitting|working)\s+(?:in|at)\s+(?:the\s+)?(lab|laboratory|department)/gi;
      let responseMatch;
      while ((responseMatch = responsePattern.exec(segments)) !== null) {
        console.log(`  Found location response: "${responseMatch[0]}"`);
        // If they say "in lab" without mentioning university, they're likely in a lab (not at university)
        if (responseMatch[1] && !segments.includes('university') && !segments.includes('punjab')) {
          speakerScores[speaker].callerScore += 25;
          speakerScores[speaker].calleeScore += 25;
        }
      }
    }
    
    // Check for institution mentions in general context (weaker signal)
    if (callerInfo?.institution) {
      const institutionLower = callerInfo.institution.toLowerCase();
      const institutionWords = institutionLower.split(/\s+/);
      let mentionCount = 0;
      for (const word of institutionWords) {
        if (word.length > 3 && segments.includes(word)) { // Only count significant words
          mentionCount++;
        }
      }
      if (mentionCount >= Math.min(2, institutionWords.length)) {
        speakerScores[speaker].callerScore += 10;
      }
    }
    
    if (calleeInfo?.institution) {
      const institutionLower = calleeInfo.institution.toLowerCase();
      const institutionWords = institutionLower.split(/\s+/);
      let mentionCount = 0;
      for (const word of institutionWords) {
        if (word.length > 3 && segments.includes(word)) { // Only count significant words
          mentionCount++;
        }
      }
      if (mentionCount >= Math.min(2, institutionWords.length)) {
        speakerScores[speaker].calleeScore += 10;
      }
    }
    
    // Check for name mentions (self-reference) - very strong signal
    const callerNameLower = callerName.toLowerCase();
    const calleeNameLower = calleeName.toLowerCase();
    const callerNameParts = callerNameLower.split(/\s+/).filter(p => p.length > 2);
    const calleeNameParts = calleeNameLower.split(/\s+/).filter(p => p.length > 2);
    
    // Check for full name or significant parts
    for (const namePart of callerNameParts) {
      if (segments.includes(`i'm ${namePart}`) || 
          segments.includes(`i am ${namePart}`) ||
          segments.includes(`this is ${namePart}`) ||
          (segments.includes(namePart) && (segments.includes("i'm") || segments.includes("i am")))) {
        speakerScores[speaker].callerScore += 25;
      }
    }
    
    for (const namePart of calleeNameParts) {
      if (segments.includes(`i'm ${namePart}`) ||
          segments.includes(`i am ${namePart}`) ||
          segments.includes(`this is ${namePart}`) ||
          (segments.includes(namePart) && (segments.includes("i'm") || segments.includes("i am")))) {
        speakerScores[speaker].calleeScore += 25;
      }
    }
    
    // Check for specialty mentions (weak signal, but helpful)
    if (callerInfo?.specialty) {
      const specialtyLower = callerInfo.specialty.toLowerCase();
      const specialtyWords = specialtyLower.split(/\s+/).filter(w => w.length > 3);
      for (const word of specialtyWords) {
        if (segments.includes(word)) {
          speakerScores[speaker].callerScore += 5;
        }
      }
    }
    
    if (calleeInfo?.specialty) {
      const specialtyLower = calleeInfo.specialty.toLowerCase();
      const specialtyWords = specialtyLower.split(/\s+/).filter(w => w.length > 3);
      for (const word of specialtyWords) {
        if (segments.includes(word)) {
          speakerScores[speaker].calleeScore += 5;
        }
      }
    }
  }
  
  // Assign speakers based on scores - use the speaker with highest score for each doctor
  let callerSpeaker: string | null = null;
  let calleeSpeaker: string | null = null;
  let highestCallerScore = -1;
  let highestCalleeScore = -1;
  
  // Find the speaker most likely to be the caller
  for (const speaker of speakers) {
    const netCallerScore = speakerScores[speaker].callerScore - speakerScores[speaker].calleeScore;
    if (netCallerScore > highestCallerScore) {
      highestCallerScore = netCallerScore;
      callerSpeaker = speaker;
    }
  }
  
  // Find the speaker most likely to be the callee
  for (const speaker of speakers) {
    const netCalleeScore = speakerScores[speaker].calleeScore - speakerScores[speaker].callerScore;
    if (netCalleeScore > highestCalleeScore) {
      highestCalleeScore = netCalleeScore;
      calleeSpeaker = speaker;
    }
  }
  
  // If we found distinct speakers, use them
  if (callerSpeaker && calleeSpeaker && callerSpeaker !== calleeSpeaker) {
    speakerMap.set(callerSpeaker, callerName);
    speakerMap.set(calleeSpeaker, calleeName);
    console.log(`\n✓ Speaker mapping determined:`);
    console.log(`  ${callerSpeaker} -> ${callerName} (net caller score: ${speakerScores[callerSpeaker].callerScore - speakerScores[callerSpeaker].calleeScore})`);
    console.log(`  ${calleeSpeaker} -> ${calleeName} (net callee score: ${speakerScores[calleeSpeaker].calleeScore - speakerScores[calleeSpeaker].callerScore})`);
    console.log(`  Full scores:`, JSON.stringify(speakerScores, null, 2));
  } else if (callerSpeaker) {
    // If we found a caller but not a distinct callee, assign the other speaker as callee
    const otherSpeaker = speakers.find(s => s !== callerSpeaker) || speakers[1];
    speakerMap.set(callerSpeaker, callerName);
    speakerMap.set(otherSpeaker, calleeName);
    console.log(`\n⚠ Speaker mapping (partial match):`);
    console.log(`  ${callerSpeaker} -> ${callerName}, ${otherSpeaker} -> ${calleeName}`);
    console.log(`  Full scores:`, JSON.stringify(speakerScores, null, 2));
  } else {
    // Default mapping if we can't determine - BUT only use this as last resort
    // Check if we have ANY scores first
    const totalScores = Object.values(speakerScores).reduce((sum, s) => sum + s.callerScore + s.calleeScore, 0);
    if (totalScores === 0) {
      // No matches found at all - use default
      speakerMap.set(speakers[0], callerName);
      speakerMap.set(speakers[1], calleeName);
      console.log(`\n⚠ Speaker mapping (NO MATCHES - using default): ${speakers[0]} -> ${callerName}, ${speakers[1]} -> ${calleeName}`);
    } else {
      // We have some scores but couldn't determine clearly - use highest scores
      let bestCaller = speakers[0];
      let bestCallerScore = speakerScores[speakers[0]].callerScore - speakerScores[speakers[0]].calleeScore;
      let bestCallee = speakers[1];
      let bestCalleeScore = speakerScores[speakers[1]].calleeScore - speakerScores[speakers[1]].callerScore;
      
      for (const speaker of speakers) {
        const netCaller = speakerScores[speaker].callerScore - speakerScores[speaker].calleeScore;
        const netCallee = speakerScores[speaker].calleeScore - speakerScores[speaker].callerScore;
        if (netCaller > bestCallerScore) {
          bestCallerScore = netCaller;
          bestCaller = speaker;
        }
        if (netCallee > bestCalleeScore) {
          bestCalleeScore = netCallee;
          bestCallee = speaker;
        }
      }
      
      speakerMap.set(bestCaller, callerName);
      speakerMap.set(bestCallee === bestCaller ? speakers.find(s => s !== bestCaller) || speakers[1] : bestCallee, calleeName);
      console.log(`\n⚠ Speaker mapping (ambiguous scores - using best match):`);
      console.log(`  ${bestCaller} -> ${callerName}, ${bestCallee === bestCaller ? speakers.find(s => s !== bestCaller) : bestCallee} -> ${calleeName}`);
      console.log(`  Full scores:`, JSON.stringify(speakerScores, null, 2));
    }
  }
  
  return speakerMap;
}

/**
 * Replace speaker labels with doctor names in transcript
 */
function replaceSpeakerLabels(
  transcript: string,
  speakerMap: Map<string, string>
): string {
  let result = transcript;
  
  for (const [speakerLabel, doctorName] of speakerMap.entries()) {
    const regex = new RegExp(`\\[${speakerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:`, 'gi');
    result = result.replace(regex, `[${doctorName}]:`);
  }
  
  return result;
}

export interface GroqSummaryResponse {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

export class GroqService {
  private baseUrl = 'https://api.groq.com/openai/v1';

  private get apiKey(): string {
    // Read API key dynamically to ensure it's loaded from .env
    return process.env.GROQ_API_KEY || '';
  }

  /**
   * Chat with Teddy AI assistant
   */
  async chat(question: string, context: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    const systemMessage = `You are Teddy, a friendly and helpful AI healthcare assistant for the TeddyBridge platform. You help users navigate the platform and answer questions about their data.

${context}

IMPORTANT GUIDELINES:
- Be friendly, professional, and concise
- Use the provided context to answer questions accurately
- If you don't have information about something, say so honestly
- Focus on being helpful and informative
- Keep responses clear and easy to understand
- Use healthcare-appropriate language
- DO NOT use markdown formatting (no asterisks, underscores, backticks, or other markdown syntax)
- Write plain text only, no bold, italic, code blocks, or other formatting

CONTEXT AWARENESS:
- Pay attention to the conversation context
- If the user previously asked about patients, surveys, or other topics, and then says "yes" or "yes please", they are likely confirming the previous topic, NOT asking to call someone
- Only treat "yes" as a call confirmation if the previous context was clearly about initiating a call

CALL HANDLING - CRITICAL INSTRUCTIONS:
You MUST follow these steps in order:

1. When user asks to call someone (e.g., "call amit saraswat" or "call 9622046298"):
   - IMMEDIATELY search the "AVAILABLE DOCTORS TO CALL" section in the context above
   - Extract name or phone number from user's request
   - Search by name (flexible: "Amit Saraswat" matches "Dr. Amit Kumar Saraswat", "Amit Saraswat", etc.)
   - Search by phone (compare digits only: "9622046298" matches "+91 9622046298", "962-204-6298", etc.)

2. If you FIND a match in the list:
   - DO NOT give generic UI navigation instructions
   - DO NOT say "go to Calls tab" or "click New Call"
   - INSTEAD, respond with: "I found [Doctor Name] - Phone: [Phone Number], Specialty: [Specialty]. I can help you initiate a call to them."
   - Provide the EXACT details from the list you found

3. If you DO NOT find a match:
   - Then say: "I couldn't find [name/phone] in the available doctors list. They may not be registered yet."

EXAMPLE GOOD RESPONSE (when doctor is found):
"I found Dr. Amit Saraswat - Phone: 9622046298, Specialty: Cardiology. I can help you initiate a call to them."

EXAMPLE BAD RESPONSE (when doctor is found):
"Go to the Calls tab and search for Amit Saraswat..." ❌ DO NOT DO THIS IF DOCTOR IS IN THE LIST`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: question }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
    
    // Remove markdown formatting (**, __, etc.)
    // Order matters: process longer patterns first
    content = content
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1') // Remove ***bold italic***
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
      .replace(/__(.*?)__/g, '$1') // Remove __bold__
      .replace(/~~(.*?)~~/g, '$1') // Remove ~~strikethrough~~
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`([^`]+)`/g, '$1') // Remove `code`
      .replace(/\*(.*?)\*/g, '$1') // Remove *italic* (must be after **)
      .replace(/_(.*?)_/g, '$1') // Remove _italic_ (must be after __)
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links, keep text
      .replace(/#{1,6}\s+/g, '') // Remove heading markers
      .trim();
    
    return content;
  }

  /**
   * Generate a summary from a call transcript
   */
  async generateSummary(request: GroqSummaryRequest): Promise<GroqSummaryResponse> {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    // Use original transcript without speaker mapping - we'll generate a brief anonymous summary
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
            content: 'You are a medical documentation assistant. Generate brief, professional summaries of doctor-to-doctor consultations without mentioning specific doctor names or attributing statements to individuals. Focus on the content discussed, key information, decisions made, and action items. Use neutral, anonymous language.',
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
    let prompt = `Please generate a brief, professional summary of this doctor-to-doctor consultation call.\n\n`;

    if (request.callDuration) {
      prompt += `Call Duration: ${Math.floor(request.callDuration / 60)} minutes\n\n`;
    }

    prompt += `TRANSCRIPT:\n`;
    prompt += `===========\n`;
    prompt += `${request.transcript}\n\n`;

    prompt += `INSTRUCTIONS:\n`;
    prompt += `=============\n`;
    prompt += `Generate a brief, concise summary of the conversation WITHOUT mentioning specific doctor names or attributing statements to individuals.\n`;
    prompt += `Focus on:\n`;
    prompt += `- The main purpose and topic of the conversation\n`;
    prompt += `- Key information discussed (locations, events, activities mentioned)\n`;
    prompt += `- Important decisions or agreements reached\n`;
    prompt += `- Any follow-up actions or next steps\n\n`;
    prompt += `Keep the summary professional but brief. Use neutral language like "one participant mentioned", "the discussion covered", "it was noted that", "arrangements were made for", etc.\n`;
    prompt += `DO NOT use doctor names.\n`;
    prompt += `DO NOT attribute specific statements to specific individuals.\n`;
    prompt += `DO NOT say "Dr. X stated" or "Dr. Y mentioned".\n\n`;

    prompt += `Please provide:\n`;
    prompt += `1. A brief summary (1-2 paragraphs) - anonymous, focusing on the content discussed\n`;
    prompt += `2. Key points discussed (bullet list) - without names or attribution\n`;
    prompt += `3. Action items or follow-ups (bullet list) - without names\n\n`;

    prompt += `Format your response as JSON with the following structure:\n`;
    prompt += `{\n`;
    prompt += `  "summary": "Brief anonymous summary of the conversation content",\n`;
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


import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, X, Send, Stethoscope, Bot, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface TeddyAssistantProps {
  userRole: "PATIENT" | "DOCTOR";
}

// Speech Recognition types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function TeddyAssistant({ userRole }: TeddyAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSpeechMode, setIsSpeechMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi! I'm Teddy, your AI assistant. I'm here to help you navigate the platform. How can I assist you today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [useCloudSTT, setUseCloudSTT] = useState(false); // Track if cloud STT is available
  const [useCloudTTS, setUseCloudTTS] = useState(false); // Track if cloud TTS is available
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Store the stream separately
  const audioChunksRef = useRef<Blob[]>([]);
  const inputStateRef = useRef({ input: "", transcript: "" });
  const manuallyStoppedRef = useRef(false); // Track if user manually stopped listening
  const speechModeRef = useRef(isSpeechMode); // Track speech mode state
  const isOpenRef = useRef(isOpen); // Track open state
  const isListeningRef = useRef(isListening); // Track listening state
  const isSpeakingRef = useRef(isSpeaking); // Track speaking state
  
  // Keep refs in sync with state
  useEffect(() => {
    inputStateRef.current = { input, transcript };
    speechModeRef.current = isSpeechMode;
    isOpenRef.current = isOpen;
    isListeningRef.current = isListening;
    isSpeakingRef.current = isSpeaking;
  }, [input, transcript, isSpeechMode, isOpen, isListening, isSpeaking]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Check browser support
  const isSpeechSupported = typeof window !== 'undefined' && 
    (window.SpeechRecognition || window.webkitSpeechRecognition) &&
    'speechSynthesis' in window;

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && isSpeechSupported) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        // Reduce silence timeout to make recognition faster
        // Note: maxAlternatives might not be available in all browsers
        if ('maxAlternatives' in recognition) {
          (recognition as any).maxAlternatives = 1;
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            const newInput = (inputStateRef.current.input + finalTranscript).trim();
            // Immediately submit when we get final transcript - don't wait for onend
            setInput('');
            setTranscript('');
            inputStateRef.current.input = '';
            inputStateRef.current.transcript = '';
            
            // Submit immediately without waiting for onend
            // Check mutation state via a callback to avoid stale closure
            setTimeout(() => {
              if (newInput && isSpeechMode && isOpen) {
                // Use a ref or direct check - mutation state is checked in the mutation itself
                askTeddyMutation.mutate(newInput);
              }
            }, 0); // Use setTimeout 0 to ensure state is up to date
          } else {
            setTranscript(interimTranscript);
            inputStateRef.current.transcript = interimTranscript;
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (event.error === 'no-speech') {
            // Auto-restart if no speech detected (only if not manually stopped)
            if (!manuallyStoppedRef.current) {
              setTimeout(() => {
                if (isSpeechMode && isOpen && !manuallyStoppedRef.current) {
                  startListening();
                }
              }, 1000);
            }
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          
          // Check if user manually stopped - if so, don't auto-restart
          if (manuallyStoppedRef.current) {
            manuallyStoppedRef.current = false; // Reset flag
            return; // Don't auto-restart or submit if manually stopped
          }
          
          // Check if we have any remaining input to submit (fallback in case onresult didn't catch it)
          // Use ref to get latest state values
          setTimeout(() => {
            const finalInput = (inputStateRef.current.input + inputStateRef.current.transcript).trim();
            if (finalInput && isSpeechMode && isOpen && !askTeddyMutation.isPending) {
              // Clear and submit (this is a fallback if onresult didn't submit)
              setInput("");
              setTranscript("");
              inputStateRef.current.input = '';
              inputStateRef.current.transcript = '';
              askTeddyMutation.mutate(finalInput);
            } else {
              // Auto-restart if no input or not in speech mode (only if not manually stopped)
              if (isSpeechMode && isOpen && !askTeddyMutation.isPending && !manuallyStoppedRef.current) {
                setTimeout(() => {
                  if (!manuallyStoppedRef.current) {
                    startListening();
                  }
                }, 300); // Reduced from 500ms to 300ms for faster restart
              }
            }
          }, 100); // Reduced from 300ms to 100ms for faster response
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSpeechMode, isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isSpeechMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isSpeechMode]);

  // Check if cloud STT/TTS is available
  useEffect(() => {
    const checkCloudServices = async () => {
      try {
        // Test STT endpoint
        const sttTest = await fetch('/api/teddy/stt', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: 'test' }),
        });
        const sttData = await sttTest.json();
        setUseCloudSTT(!sttData.fallback);
        
        // Test TTS endpoint
        const ttsTest = await fetch('/api/teddy/tts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'test' }),
        });
        const ttsData = await ttsTest.json();
        setUseCloudTTS(!ttsData.fallback);
      } catch (error) {
        // Services not available, use browser APIs
        setUseCloudSTT(false);
        setUseCloudTTS(false);
      }
    };
    
    if (isOpen && isSpeechMode) {
      checkCloudServices();
    }
  }, [isOpen, isSpeechMode]);

  // Handle speech mode toggle
  useEffect(() => {
    if (isSpeechMode && isOpen) {
      startListening();
    } else if (!isSpeechMode) {
      stopListening();
    }
  }, [isSpeechMode, isOpen]);

  /**
   * Professional listening restart handler
   * Ensures listening restarts after TTS completes, with proper state management
   * Uses refs exclusively to avoid stale closure issues
   */
  const restartListeningAfterTTS = useCallback(() => {
    // Use a delay to ensure audio has fully stopped and React state has updated
    // Reduced delay for faster response (600ms instead of 800ms)
    setTimeout(() => {
      // Check all conditions using refs exclusively (always current, no stale closures)
      const shouldRestart = 
        speechModeRef.current &&        // Speech mode is active
        isOpenRef.current &&              // Chat is open
        !manuallyStoppedRef.current &&    // User hasn't manually stopped
        !isListeningRef.current &&        // Not already listening (using ref)
        !isSpeakingRef.current;           // Not currently speaking (using ref)
      
      if (shouldRestart) {
        console.log('[Teddy] ✅ Restarting listening after TTS');
        // Small additional delay to ensure audio context is fully cleared
        setTimeout(() => {
          if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
            startListening();
          }
        }, 200);
      } else {
        console.log('[Teddy] ⏸️ Skipping restart:', {
          speechMode: speechModeRef.current,
          isOpen: isOpenRef.current,
          manuallyStopped: manuallyStoppedRef.current,
          isListening: isListeningRef.current,
          isSpeaking: isSpeakingRef.current
        });
      }
    }, 600); // Reduced delay for faster response
  }, []); // No dependencies - uses refs exclusively

  const startListening = async () => {
    // Don't start listening if already listening or if Teddy is speaking
    // This prevents the microphone from picking up TTS audio and creating a feedback loop
    if (isListening || isSpeaking) {
      return;
    }
    
    // Try cloud STT if available, otherwise use browser API
    if (useCloudSTT) {
      try {
        manuallyStoppedRef.current = false;
        setIsListening(true);
        
        // Get user media with better audio settings
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000, // Optimal for speech recognition
          } 
        });
        
        const mediaRecorder = new MediaRecorder(stream, { 
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 16000 // Lower bitrate for faster processing
        });
        mediaRecorderRef.current = mediaRecorder;
        streamRef.current = stream; // Store stream separately
        audioChunksRef.current = [];
        
        // Track last audio activity for better silence detection
        let lastAudioActivity = Date.now();
        let silenceTimeout: NodeJS.Timeout | null = null;
        let recordingTimeout: NodeJS.Timeout | null = null;
        const MAX_RECORDING_TIME = 30000; // 30 seconds max
        const SILENCE_THRESHOLD = 2000; // 2 seconds of silence
        
        // Use AudioContext for better silence detection
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let isRecording = true;
        
        // Voice Activity Detection (VAD) loop
        const checkAudioLevel = () => {
          if (!isRecording || manuallyStoppedRef.current) return;
          
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const threshold = 20; // Adjust based on testing
          
          if (average > threshold) {
            // Audio detected - reset silence timer
            lastAudioActivity = Date.now();
            if (silenceTimeout) {
              clearTimeout(silenceTimeout);
              silenceTimeout = null;
            }
          } else {
            // Silence detected - check if we should stop
            const silenceDuration = Date.now() - lastAudioActivity;
            if (silenceDuration >= SILENCE_THRESHOLD && !silenceTimeout) {
              // Stop after silence threshold
              silenceTimeout = setTimeout(() => {
                if (mediaRecorder.state === 'recording' && !manuallyStoppedRef.current) {
                  mediaRecorder.stop();
                  isRecording = false;
                }
              }, 100);
            }
          }
          
          if (isRecording) {
            requestAnimationFrame(checkAudioLevel);
          }
        };
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          isRecording = false;
          if (silenceTimeout) clearTimeout(silenceTimeout);
          if (recordingTimeout) clearTimeout(recordingTimeout);
          
          // Clean up audio context
          audioContext.close();
          source.disconnect();
          analyser.disconnect();
          
          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          
          // Don't process audio if manually stopped or if Teddy is speaking
          // This prevents processing audio that might contain TTS feedback
          if (manuallyStoppedRef.current || isSpeaking) {
            audioChunksRef.current = [];
            setIsListening(false);
            return;
          }
          
          // Combine audio chunks and send to server
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];
          
          // Validate we have audio data
          if (!audioBlob || audioBlob.size === 0) {
            console.warn('No audio data recorded, skipping transcription');
            setIsListening(false);
            // Auto-restart if in speech mode
            if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
              setTimeout(() => {
                if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                  startListening();
                }
              }, 500);
            }
            return;
          }
          
          // Ensure minimum audio size (at least a few KB)
          if (audioBlob.size < 1024) {
            console.warn('Audio data too small, might be invalid');
            setIsListening(false);
            // Auto-restart if in speech mode
            if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
              setTimeout(() => {
                if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                  startListening();
                }
              }, 500);
            }
            return;
          }
          
          try {
            // Convert blob to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
              const result = reader.result as string;
              if (!result || !result.includes(',')) {
                console.error('Invalid FileReader result');
                setUseCloudSTT(false);
                setIsListening(false);
                startListeningBrowser();
                return;
              }
              
              const base64Audio = result.split(',')[1];
              
              if (!base64Audio || base64Audio.length === 0) {
                console.error('Invalid base64 audio data');
                setUseCloudSTT(false);
                setIsListening(false);
                startListeningBrowser();
                return;
              }
              
              try {
                let response: Response;
                try {
                  response = await apiRequest("POST", "/api/teddy/stt", {
                    audio: base64Audio,
                  });
                } catch (fetchError: any) {
                  console.error('STT API request failed:', fetchError);
                  // Fallback to browser STT on network errors
                  setUseCloudSTT(false);
                  setIsListening(false);
                  startListeningBrowser();
                  return;
                }
                
                const data = await response.json();
                
                if (data.transcript && !data.fallback) {
                  const transcript = data.transcript.trim();
                  if (transcript && transcript.length > 0) {
                    // Submit immediately
                    setInput('');
                    setTranscript('');
                    setIsListening(false);
                    askTeddyMutation.mutate(transcript);
                  } else {
                    // Empty transcript - restart listening
                    setIsListening(false);
                    if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
                      setTimeout(() => {
                        if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                          startListening();
                        }
                      }, 500);
                    }
                  }
                } else if (data.fallback) {
                  // Fallback to browser STT
                  setUseCloudSTT(false);
                  setIsListening(false);
                  startListeningBrowser();
                } else {
                  // No transcript - restart listening
                  setIsListening(false);
                  if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
                    setTimeout(() => {
                      if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                        startListening();
                      }
                    }, 500);
                  }
                }
              } catch (error) {
                console.error('Cloud STT processing error:', error);
                // Fallback to browser STT on any error
                setUseCloudSTT(false);
                setIsListening(false);
                // Only restart if in speech mode and not manually stopped
                if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
                  setTimeout(() => {
                    if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                      startListeningBrowser();
                    }
                  }, 500);
                }
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (error) {
            console.error('Error processing audio:', error);
            setUseCloudSTT(false);
            setIsListening(false);
            startListeningBrowser();
          }
        };
        
        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms for better real-time feel
        
        // Start VAD loop
        checkAudioLevel();
        
        // Safety timeout - stop after max recording time
        recordingTimeout = setTimeout(() => {
          if (mediaRecorder.state === 'recording' && !manuallyStoppedRef.current) {
            mediaRecorder.stop();
            isRecording = false;
          }
        }, MAX_RECORDING_TIME);
        
      } catch (error) {
        console.error('Error starting cloud STT, falling back to browser:', error);
        setUseCloudSTT(false);
        setIsListening(false);
        startListeningBrowser();
      }
    } else {
      // Use browser STT
      startListeningBrowser();
    }
  };

  const startListeningBrowser = () => {
    // Don't start if already listening or if Teddy is speaking
    if (recognitionRef.current && !isListening && !isSpeaking) {
      try {
        manuallyStoppedRef.current = false; // Reset manual stop flag when starting
        
        // Configure browser STT for better performance
        recognitionRef.current.continuous = true; // Keep listening
        recognitionRef.current.interimResults = true; // Get interim results for better UX
        recognitionRef.current.lang = 'en-US';
        
        // Handle interim results for better UX
        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Update transcript for display
          if (interimTranscript) {
            setTranscript(interimTranscript);
          }
          
          // Auto-submit when we get a final result
          if (finalTranscript.trim()) {
            const cleanTranscript = finalTranscript.trim();
            setInput('');
            setTranscript('');
            setIsListening(false);
            askTeddyMutation.mutate(cleanTranscript);
          }
        };
        
        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          
          // Auto-restart on certain errors
          if (event.error === 'no-speech' || event.error === 'audio-capture') {
            if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
              setTimeout(() => {
                if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                  startListeningBrowser();
                }
              }, 1000);
            }
          }
        };
        
        recognitionRef.current.onend = () => {
          setIsListening(false);
          
          // Auto-restart if in speech mode and not manually stopped
          if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current && !isSpeakingRef.current) {
            setTimeout(() => {
              if (!manuallyStoppedRef.current && !isListeningRef.current && !isSpeakingRef.current) {
                startListeningBrowser();
              }
            }, 500);
          }
        };
        
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error: any) {
        console.error('Error starting speech recognition:', error);
        setIsListening(false);
        
        // If error is "already started", try to stop and restart
        if (error.message?.includes('already') || error.name === 'InvalidStateError') {
          try {
            recognitionRef.current?.stop();
            setTimeout(() => {
              if (!manuallyStoppedRef.current && !isSpeakingRef.current) {
                startListeningBrowser();
              }
            }, 500);
          } catch (retryError) {
            console.error('Error retrying speech recognition:', retryError);
          }
        }
      }
    }
  };

  const stopListening = () => {
    manuallyStoppedRef.current = true; // Mark as manually stopped
    
    // Stop cloud STT (MediaRecorder)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
      }
    }
    
    // Stop all tracks from the stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        streamRef.current = null;
      } catch (error) {
        console.error('Error stopping stream tracks:', error);
      }
    }
    
    // Stop browser STT
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort(); // Also abort to ensure it stops immediately
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }
    
    setIsListening(false);
    setTranscript('');
    audioChunksRef.current = [];
  };

  // Sanitize text to remove IDs and technical details before speaking
  const sanitizeTextForSpeech = (text: string): string => {
    let sanitized = text;
    
    // Remove UUIDs (8-4-4-4-12 format)
    sanitized = sanitized.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');
    
    // Remove "ID:" patterns with IDs in parentheses or after colon
    sanitized = sanitized.replace(/\(ID:\s*[^)]+\)/gi, '');
    sanitized = sanitized.replace(/ID:\s*[0-9a-f-]{20,}/gi, '');
    
    // Remove email-like patterns that might be technical
    sanitized = sanitized.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, (match) => {
      // Keep simple emails but skip if it looks like a technical identifier
      if (match.includes('-') && match.split('-').length > 2) {
        return '';
      }
      return match;
    });
    
    // Remove hex codes (like #FF5733 or 0xABCDEF)
    sanitized = sanitized.replace(/#[0-9a-f]{3,6}\b/gi, '');
    sanitized = sanitized.replace(/\b0x[0-9a-f]+\b/gi, '');
    
    // Clean up multiple spaces and trim
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Remove leading/trailing punctuation that might be left over
    sanitized = sanitized.replace(/^[,\s.]+|[,\s.]+$/g, '');
    
    return sanitized;
  };

  const speakText = async (text: string) => {
    // Sanitize text before speaking to remove IDs and technical details
    const sanitizedText = sanitizeTextForSpeech(text);
    
    // Don't speak if nothing is left after sanitization
    if (!sanitizedText || sanitizedText.trim().length === 0) {
      return;
    }

    // CRITICAL: Stop listening when Teddy starts speaking to prevent feedback loop
    // The microphone will pick up the TTS audio and cause Teddy to respond to itself
    if (isListening) {
      stopListening();
    }

    // Try cloud TTS first, fallback to browser TTS
    if (useCloudTTS) {
      try {
        setIsSpeaking(true);
        
        let response: Response;
        try {
          response = await apiRequest("POST", "/api/teddy/tts", {
            text: sanitizedText,
            voice: 'Basil-PlayAI', // Natural, friendly voice from Groq
          });
        } catch (fetchError: any) {
          console.error('TTS API request failed:', fetchError);
          // Fallback to browser TTS on network errors
          setIsSpeaking(false);
          setUseCloudTTS(false);
          speakTextBrowser(sanitizedText);
          return;
        }
        
        const data = await response.json();
        
        if (data.audio && !data.fallback) {
          // Convert base64 to audio and play (Groq returns WAV format)
          const audioBlob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            // Restart listening after cloud TTS completes
            restartListeningAfterTTS();
          };
          
          audio.onerror = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            // Fallback to browser TTS - it will handle restarting listening
            speakTextBrowser(sanitizedText);
          };
          
          audio.onpause = () => {
            // Ensure speaking state is cleared if audio is paused
            setIsSpeaking(false);
          };
          
          await audio.play();
          return;
        } else if (data.fallback) {
          // Cloud TTS not available, fallback to browser TTS
          setIsSpeaking(false); // Reset speaking state before fallback
          speakTextBrowser(sanitizedText);
          return;
        }
      } catch (error) {
        console.error('Cloud TTS error, falling back to browser:', error);
        setIsSpeaking(false); // Reset speaking state on error
        // Fallback to browser TTS - it will handle restarting listening
      }
    }
    
    // Fallback to browser TTS
    speakTextBrowser(sanitizedText);
  };

  const speakTextBrowser = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech immediately
      window.speechSynthesis.cancel();
      
      // Small delay to ensure cancellation is processed
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0; // Natural speaking rate
        utterance.pitch = 1.0; // Natural pitch
        utterance.volume = 1.0; // Full volume
        utterance.lang = 'en-US';

        utterance.onstart = () => {
          setIsSpeaking(true);
          // Ensure listening is stopped when speaking starts
          if (isListening) {
            stopListening();
          }
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          // Restart listening after browser TTS completes
          restartListeningAfterTTS();
        };

        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          setIsSpeaking(false);
          // Still try to restart listening even on error
          if (speechModeRef.current && isOpenRef.current && !manuallyStoppedRef.current) {
            restartListeningAfterTTS();
          }
        };

        utterance.onpause = () => {
          // Handle pause - don't clear speaking state immediately
        };

        utterance.onresume = () => {
          // Handle resume
        };

        synthesisRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      }, 100);
    }
  };

  const toggleSpeechMode = () => {
    if (!isSpeechSupported) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const newMode = !isSpeechMode;
    setIsSpeechMode(newMode);
    
    if (newMode) {
      // Switching to speech mode
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } else {
      // Switching to text mode
      stopListening();
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const askTeddyMutation = useMutation({
    mutationFn: async (question: string) => {
      try {
        const response = await apiRequest("POST", "/api/teddy/ask", {
          question,
          role: userRole,
        });
        const data = await response.json();
        return data as { answer: string; action?: string; doctorId?: string; doctorName?: string };
      } catch (error: any) {
        // Provide more helpful error messages
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
        }
        if (error instanceof Error && error.message.includes('401')) {
          throw new Error('Session expired. Please refresh the page and try again.');
        }
        if (error instanceof Error && error.message.includes('500')) {
          throw new Error('Server error. Please try again in a moment.');
        }
        throw error;
      }
    },
    onSuccess: async (data, question) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question, timestamp: new Date() },
        { role: "assistant", content: data.answer, timestamp: new Date() },
      ]);
      setInput("");
      setTranscript("");
      
      // Speak the response if in speech mode
      if (isSpeechMode) {
        speakText(data.answer);
      }
      
      // Handle call initiation action
      if (data.action === 'initiate_call' && data.doctorId && userRole === 'DOCTOR') {
        try {
          const callResponse = await apiRequest("POST", "/api/twilio/call", {
            calleeDoctorId: data.doctorId,
          });
          const callData = await callResponse.json();
          
          // Add success message
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Call initiated successfully! You and ${data.doctorName || 'the doctor'} will receive phone calls shortly.`,
              timestamp: new Date(),
            },
          ]);
        } catch (error) {
          // Add error message
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Sorry, I encountered an error initiating the call: ${error instanceof Error ? error.message : "Please try again later."}`,
              timestamp: new Date(),
            },
          ]);
        }
      }
    },
    onError: (error) => {
      console.error('Teddy AI error:', error);
      const errorMessage = error instanceof Error ? error.message : "Please try again later.";
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
      
      // Stop listening if in speech mode to avoid feedback loop
      if (isSpeechMode && isListening) {
        stopListening();
      }
    },
  });

  const handleSend = () => {
    const question = (input + transcript).trim();
    if (!question || askTeddyMutation.isPending) return;

    askTeddyMutation.mutate(question);
    setTranscript("");
  };

  const handleAutoSubmit = (question: string) => {
    if (!question || askTeddyMutation.isPending) return;

    // Clear input and transcript
    setInput("");
    setTranscript("");
    
    // Submit the question automatically
    askTeddyMutation.mutate(question);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 md:bottom-8 md:right-8 z-[9999] h-14 w-14 sm:h-16 sm:w-16 md:h-16 md:w-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 ease-out flex items-center justify-center group hover:scale-110 active:scale-95 touch-manipulation"
        aria-label="Open Teddy AI Assistant"
        style={{ position: 'fixed' }}
      >
        <div className="relative">
          <Stethoscope className="h-6 w-6 sm:h-7 sm:w-7 md:h-7 md:w-7 transition-transform group-hover:scale-110" />
          {!isOpen && (
            <span className="absolute -top-1 -right-1 h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>
      </button>

      {/* Chat Popup */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-20 sm:right-4 md:bottom-24 md:right-6 lg:bottom-28 lg:right-8 z-[9999] w-full sm:w-[420px] sm:max-w-[420px] md:w-96 lg:w-[420px] h-full sm:h-[600px] sm:max-h-[85vh] md:max-h-[80vh] flex flex-col shadow-2xl sm:rounded-2xl overflow-hidden border-0 sm:border border-gray-200/50 dark:border-gray-800/50 bg-white dark:bg-gray-900 backdrop-blur-sm" style={{ position: 'fixed', paddingLeft: 'max(0px, env(safe-area-inset-left))', paddingRight: 'max(0px, env(safe-area-inset-right))' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-3 sm:p-4 md:p-4 flex items-center justify-between flex-shrink-0 safe-area-top">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 sm:h-10 sm:w-10 md:h-10 md:w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Stethoscope className="h-5 w-5 sm:h-6 sm:w-6 md:h-6 md:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-base sm:text-lg md:text-lg truncate">Teddy AI</h3>
                <p className="text-xs sm:text-sm text-blue-100 truncate">
                  {isSpeechMode ? "Voice Mode" : "Text Mode"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Speech Mode Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSpeechMode}
                disabled={!isSpeechSupported}
                className={`h-9 w-9 sm:h-10 sm:w-10 md:h-10 md:w-10 hover:bg-white/20 text-white transition-all touch-manipulation flex-shrink-0 ${
                  isSpeechMode ? 'bg-white/30' : ''
                } ${!isSpeechSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  !isSpeechSupported 
                    ? "Speech mode not supported in this browser" 
                    : isSpeechMode 
                    ? "Switch to Text Mode" 
                    : "Switch to Voice Mode"
                }
              >
                {isSpeechMode ? (
                  <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  stopListening();
                  window.speechSynthesis.cancel();
                }}
                className="h-9 w-9 sm:h-10 sm:w-10 md:h-10 md:w-10 p-0 hover:bg-white/20 text-white touch-manipulation flex-shrink-0"
                aria-label="Close chat"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 min-h-0 overscroll-contain scroll-smooth">
            <div className="space-y-3 sm:space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] md:max-w-[75%] rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 md:px-4 md:py-3 ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-4 md:w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold">Teddy</span>
                      </div>
                    )}
                    <p className="text-sm sm:text-base md:text-[15px] whitespace-pre-wrap leading-relaxed break-words">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}
              {askTeddyMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5">
                    <div className="flex items-center gap-2 sm:gap-2.5">
                      <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600" />
                      <span className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-400">
                        Teddy is thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {/* Speech Mode Visual Indicators */}
              {isSpeechMode && (
                <>
                  {isListening && (
                    <div className="flex justify-start">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 border border-blue-200 dark:border-blue-800 max-w-full">
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* Animated Waveform */}
                          <div className="flex items-end gap-0.5 sm:gap-1 h-5 sm:h-6 flex-shrink-0">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div
                                key={i}
                                className="w-0.5 sm:w-1 bg-blue-500 rounded-full animate-waveform"
                                style={{
                                  minHeight: '4px',
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm md:text-base font-medium text-blue-700 dark:text-blue-300">
                              Listening...
                            </p>
                            {transcript && (
                              <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 mt-1 italic break-words overflow-wrap-anywhere">
                                {transcript}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {isSpeaking && (
                    <div className="flex justify-start">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 border border-green-200 dark:border-green-800 max-w-full">
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* Animated Speaking Indicator */}
                          <div className="relative flex-shrink-0">
                            <Volume2 className="h-4 w-4 sm:h-5 sm:w-5 md:h-5 md:w-5 text-green-600 dark:text-green-400 animate-pulse" />
                            <div className="absolute inset-0 rounded-full bg-green-400/30 animate-ping" />
                          </div>
                          <p className="text-xs sm:text-sm md:text-base font-medium text-green-700 dark:text-green-300 break-words">
                            Teddy is speaking...
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="p-3 sm:p-4 md:p-5 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex-shrink-0 safe-area-bottom">
            {isSpeechMode ? (
              <div className="space-y-2.5 sm:space-y-3">
                {/* Speech Input Display */}
                <div className="min-h-[3rem] sm:min-h-[3.5rem] p-3 sm:p-3.5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  {input || transcript ? (
                    <p className="text-sm sm:text-base text-gray-900 dark:text-gray-100 break-words">
                      {input}
                      {transcript && (
                        <span className="text-gray-500 italic">{transcript}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs sm:text-sm text-gray-400 italic text-center">
                      {isListening ? "Listening... Speak naturally" : "Starting voice mode..."}
                    </p>
                  )}
                </div>
                {/* Auto Mode Indicator */}
                <div className="flex items-center justify-center px-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap justify-center">
                    <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                    <span className="text-center break-words">Auto mode - Speak and I'll respond automatically</span>
                  </div>
                </div>
                {/* Optional Stop Button (only show when listening) */}
                {isListening && (
                  <div className="flex items-center justify-center">
                    <Button
                      onClick={stopListening}
                      size="sm"
                      variant="outline"
                      className="rounded-full border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 touch-manipulation text-xs sm:text-sm px-4 sm:px-5 py-2"
                    >
                      <MicOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 mr-1.5 sm:mr-2 flex-shrink-0" />
                      <span className="whitespace-nowrap">Stop Listening</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2 sm:gap-2.5">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask Teddy anything..."
                  disabled={askTeddyMutation.isPending}
                  className="flex-1 text-sm sm:text-base md:text-[15px] h-11 sm:h-12 min-h-[44px]"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || askTeddyMutation.isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 h-11 sm:h-12 w-11 sm:w-12 min-h-[44px] min-w-[44px] p-0 touch-manipulation flex-shrink-0"
                  aria-label="Send message"
                >
                  {askTeddyMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}


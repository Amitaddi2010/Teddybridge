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
        startListening();
      } else {
        console.log('[Teddy] ⏸️ Skipping restart:', {
          speechMode: speechModeRef.current,
          isOpen: isOpenRef.current,
          manuallyStopped: manuallyStoppedRef.current,
          isListening: isListeningRef.current,
          isSpeaking: isSpeakingRef.current
        });
      }
    }, 800); // Delay to ensure audio has fully stopped
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
        
        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
          
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
            if (isSpeechMode && isOpen && !manuallyStoppedRef.current) {
              setTimeout(() => {
                if (!manuallyStoppedRef.current) {
                  startListening();
                }
              }, 300);
            }
            return;
          }
          
          // Ensure minimum audio size (at least a few KB)
          if (audioBlob.size < 1024) {
            console.warn('Audio data too small, might be invalid');
            // Still try to send it, but log a warning
          }
          
          try {
            // Convert blob to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
              const result = reader.result as string;
              if (!result || !result.includes(',')) {
                console.error('Invalid FileReader result');
                setUseCloudSTT(false);
                startListeningBrowser();
                return;
              }
              
              const base64Audio = result.split(',')[1];
              
              if (!base64Audio || base64Audio.length === 0) {
                console.error('Invalid base64 audio data');
                setUseCloudSTT(false);
                startListeningBrowser();
                return;
              }
              
              try {
                const response = await apiRequest("POST", "/api/teddy/stt", {
                  audio: base64Audio,
                });
                
                const data = await response.json();
                
                if (data.transcript && !data.fallback) {
                  const transcript = data.transcript.trim();
                  if (transcript) {
                    // Submit immediately
                    setInput('');
                    setTranscript('');
                    askTeddyMutation.mutate(transcript);
                  }
                } else if (data.fallback) {
                  // Fallback to browser STT
                  setUseCloudSTT(false);
                  startListeningBrowser();
                }
              } catch (error) {
                console.error('Cloud STT error:', error);
                // Fallback to browser STT
                setUseCloudSTT(false);
                startListeningBrowser();
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (error) {
            console.error('Error processing audio:', error);
            setUseCloudSTT(false);
            startListeningBrowser();
          }
        };
        
        // Start recording
        mediaRecorder.start();
        
        // Stop recording after 5 seconds of silence or when manually stopped
        setTimeout(() => {
          if (mediaRecorder.state === 'recording' && !manuallyStoppedRef.current) {
            mediaRecorder.stop();
          }
        }, 5000);
        
      } catch (error) {
        console.error('Error starting cloud STT, falling back to browser:', error);
        setUseCloudSTT(false);
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
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  const stopListening = () => {
    manuallyStoppedRef.current = true; // Mark as manually stopped
    
    // Stop cloud STT (MediaRecorder)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        // Stop all tracks
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
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
        
        const response = await apiRequest("POST", "/api/teddy/tts", {
          text: sanitizedText,
          voice: 'Basil-PlayAI', // Natural, friendly voice from Groq
        });
        
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
      window.speechSynthesis.cancel(); // Cancel any ongoing speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        // Restart listening after browser TTS completes
        restartListeningAfterTTS();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      synthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
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
      const response = await apiRequest("POST", "/api/teddy/ask", {
        question,
        role: userRole,
      });
      const data = await response.json();
      return data as { answer: string; action?: string; doctorId?: string; doctorName?: string };
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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Please try again later."}`,
          timestamp: new Date(),
        },
      ]);
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
        className="fixed bottom-6 right-6 z-[9999] h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 ease-out flex items-center justify-center group hover:scale-110"
        aria-label="Open Teddy AI Assistant"
        style={{ position: 'fixed' }}
      >
        <div className="relative">
          <Stethoscope className="h-8 w-8 transition-transform group-hover:scale-110" />
          {!isOpen && (
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>
      </button>

      {/* Chat Popup */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-[9999] w-96 h-[600px] flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-gray-200/50 dark:border-gray-800/50 bg-white dark:bg-gray-900 backdrop-blur-sm" style={{ position: 'fixed' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Teddy AI</h3>
                <p className="text-xs text-blue-100">
                  {isSpeechMode ? "Voice Mode" : "Text Mode"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Speech Mode Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSpeechMode}
                disabled={!isSpeechSupported}
                className={`h-8 px-3 hover:bg-white/20 text-white transition-all ${
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
                  <Mic className="h-4 w-4" />
                ) : (
                  <MicOff className="h-4 w-4" />
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
                className="h-8 w-8 p-0 hover:bg-white/20 text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-semibold">Teddy</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}
              {askTeddyMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
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
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl px-4 py-3 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                          {/* Animated Waveform */}
                          <div className="flex items-end gap-1 h-6">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div
                                key={i}
                                className="w-1 bg-blue-500 rounded-full animate-waveform"
                                style={{
                                  minHeight: '4px',
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                              Listening...
                            </p>
                            {transcript && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">
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
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl px-4 py-3 border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-3">
                          {/* Animated Speaking Indicator */}
                          <div className="relative">
                            <Volume2 className="h-5 w-5 text-green-600 dark:text-green-400 animate-pulse" />
                            <div className="absolute inset-0 rounded-full bg-green-400/30 animate-ping" />
                          </div>
                          <p className="text-sm font-medium text-green-700 dark:text-green-300">
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
            {isSpeechMode ? (
              <div className="space-y-3">
                {/* Speech Input Display */}
                <div className="min-h-[3rem] p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  {input || transcript ? (
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {input}
                      {transcript && (
                        <span className="text-gray-500 italic">{transcript}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic text-center">
                      {isListening ? "Listening... Speak naturally" : "Starting voice mode..."}
                    </p>
                  )}
                </div>
                {/* Auto Mode Indicator */}
                <div className="flex items-center justify-center">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    <span>Auto mode - Speak and I'll respond automatically</span>
                  </div>
                </div>
                {/* Optional Stop Button (only show when listening) */}
                {isListening && (
                  <div className="flex items-center justify-center">
                    <Button
                      onClick={stopListening}
                      size="sm"
                      variant="outline"
                      className="rounded-full border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <MicOff className="h-4 w-4 text-red-600 mr-2" />
                      Stop Listening
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask Teddy anything..."
                  disabled={askTeddyMutation.isPending}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || askTeddyMutation.isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {askTeddyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
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


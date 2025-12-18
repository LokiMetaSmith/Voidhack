import { useState, useEffect, useCallback, useRef } from "react";

interface SpeechRecognitionResult {
  transcript: string;
  isListening: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

// Initialize audio input to "prime" Bluetooth/AirPods microphone routing
// This helps ensure the browser uses connected Bluetooth audio devices
async function initializeBluetoothAudio(): Promise<void> {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.log("[SpeechRecognition] MediaDevices API not available");
    return;
  }

  try {
    // Request audio with constraints that help select Bluetooth/external mics
    const constraints: MediaStreamConstraints = {
      audio: {
        // These constraints help prefer external/Bluetooth microphones
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    };

    console.log("[SpeechRecognition] Initializing audio input for Bluetooth/AirPods...");
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Log which audio device was selected
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      const settings = audioTracks[0].getSettings();
      const label = audioTracks[0].label;
      console.log("[SpeechRecognition] Audio input initialized:", {
        label,
        deviceId: settings.deviceId,
        isMobile
      });
    }
    
    // Stop the stream immediately - we just needed to "prime" the audio routing
    // The SpeechRecognition API will use the same audio route
    stream.getTracks().forEach(track => track.stop());
    console.log("[SpeechRecognition] Audio stream primed and released");
    
  } catch (err) {
    // Don't fail if this doesn't work - speech recognition may still work
    console.warn("[SpeechRecognition] Could not initialize Bluetooth audio:", err);
  }
}

// Detect iOS devices (iPhone, iPad, iPod)
const isIOSDevice = (): boolean => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && 
         !(window as any).MSStream; // Exclude IE11 masquerading as iPad
};

// Detect any mobile device
const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export function useSpeechRecognition(): SpeechRecognitionResult {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const startupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingRef = useRef(false); // Prevents concurrent start attempts
  const isListeningRef = useRef(false); // Imperative ref for abort guards - not affected by closure capture
  const interimTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Mobile fix: timeout to process interim results
  const lastInterimTranscriptRef = useRef<string>(""); // Mobile fix: track last interim result
  const iosSilenceTimeoutRef = useRef<NodeJS.Timeout | null>(null); // iOS fix: silence detection to stop recognition

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("[SpeechRecognition] Not supported in this browser");
      setError("Speech recognition is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    const isIOS = isIOSDevice();
    
    // iOS Safari fix: continuous mode is broken on iOS - it causes isFinal to be unreliable
    // and results to never be properly captured. Use continuous=false with silence detection instead.
    recognition.continuous = isIOS ? false : true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    console.log("[SpeechRecognition] Initialized", {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      lang: recognition.lang,
      userAgent: navigator.userAgent,
      isIOS
    });

    recognition.onstart = () => {
      console.log("[SpeechRecognition] Started successfully");
      
      // Clear startup timeout - recognition actually started
      if (startupTimeoutRef.current) {
        clearTimeout(startupTimeoutRef.current);
        startupTimeoutRef.current = null;
      }
      
      // Clear starting flag - we've successfully started
      isStartingRef.current = false;
      
      // Update imperative ref for abort guards
      isListeningRef.current = true;
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const isMobile = isMobileDevice();
      const isIOS = isIOSDevice();
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart + " ";
        } else {
          interimTranscript += transcriptPart;
        }
      }

      // iOS fix: Reset silence detection timeout on any speech activity
      // Since iOS uses continuous=false, we need to detect silence to stop recognition
      if (isIOS && (finalTranscript || interimTranscript)) {
        if (iosSilenceTimeoutRef.current) {
          clearTimeout(iosSilenceTimeoutRef.current);
        }
        
        // If we got results, set a silence timeout to process and stop
        iosSilenceTimeoutRef.current = setTimeout(() => {
          console.log("[SpeechRecognition] iOS: Silence detected, stopping recognition");
          if (recognitionRef.current && isListeningRef.current) {
            // Process any pending interim transcript before stopping
            if (lastInterimTranscriptRef.current) {
              console.log("[SpeechRecognition] iOS: Processing interim transcript on silence:", lastInterimTranscriptRef.current);
              setTranscript((prev) => prev + lastInterimTranscriptRef.current + " ");
              lastInterimTranscriptRef.current = "";
            }
            recognitionRef.current.stop();
          }
          iosSilenceTimeoutRef.current = null;
        }, 1500); // 1.5 second silence threshold for iOS
      }

      if (finalTranscript) {
        console.log("[SpeechRecognition] Final transcript received:", finalTranscript);
        
        // Clear any pending interim timeout since we got final results
        if (interimTimeoutRef.current) {
          clearTimeout(interimTimeoutRef.current);
          interimTimeoutRef.current = null;
        }
        lastInterimTranscriptRef.current = "";
        
        setTranscript((prev) => prev + finalTranscript);
        
        // iOS fix: On iOS with continuous=false, recognition stops after final result
        // We don't need to do anything special here - onend will be called
      } else if (interimTranscript) {
        console.log("[SpeechRecognition] Interim transcript:", interimTranscript);
        
        // Mobile fix: Process interim results if final results never arrive
        // This applies to both Android and iOS since both can fail to send isFinal=true
        if (isMobile) {
          lastInterimTranscriptRef.current = interimTranscript;
          
          // Clear any existing timeout
          if (interimTimeoutRef.current) {
            clearTimeout(interimTimeoutRef.current);
          }
          
          // Set timeout to process interim result if no final result arrives
          interimTimeoutRef.current = setTimeout(() => {
            if (lastInterimTranscriptRef.current) {
              console.log("[SpeechRecognition] Mobile: Processing interim transcript as final (timeout):", lastInterimTranscriptRef.current);
              setTranscript((prev) => prev + lastInterimTranscriptRef.current + " ");
              lastInterimTranscriptRef.current = "";
              
              // iOS: Also stop recognition after processing interim results
              if (isIOS && recognitionRef.current && isListeningRef.current) {
                console.log("[SpeechRecognition] iOS: Stopping recognition after interim timeout");
                recognitionRef.current.stop();
              }
            }
            interimTimeoutRef.current = null;
          }, 2000); // 2 second pause indicates end of speech
        }
      }
    };

    recognition.onerror = (event: any) => {
      const isMobile = isMobileDevice();
      console.error("[SpeechRecognition] Error:", {
        error: event.error,
        message: event.message,
        userAgent: navigator.userAgent,
        isMobile,
        isIOS: isIOSDevice(),
        hasPendingInterimResults: !!lastInterimTranscriptRef.current
      });
      
      // Mobile fix: Process any pending interim results before clearing on error
      if (isMobile && lastInterimTranscriptRef.current && event.error !== 'aborted') {
        console.log("[SpeechRecognition] Mobile: Processing interim transcript on error:", lastInterimTranscriptRef.current);
        setTranscript((prev) => prev + lastInterimTranscriptRef.current + " ");
      }
      
      // Clear any pending startup timeout
      if (startupTimeoutRef.current) {
        clearTimeout(startupTimeoutRef.current);
        startupTimeoutRef.current = null;
      }
      
      // Clear any pending interim timeout
      if (interimTimeoutRef.current) {
        clearTimeout(interimTimeoutRef.current);
        interimTimeoutRef.current = null;
      }
      
      // Clear iOS silence timeout
      if (iosSilenceTimeoutRef.current) {
        clearTimeout(iosSilenceTimeoutRef.current);
        iosSilenceTimeoutRef.current = null;
      }
      lastInterimTranscriptRef.current = "";
      
      // Clear starting flag
      isStartingRef.current = false;
      
      // CRITICAL FIX: Always abort on error to ensure clean state and release microphone
      // Errors indicate the recognition is in a bad state and must be cleaned up
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
          console.log("[SpeechRecognition] Aborted recognition after error");
        }
      } catch (abortErr) {
        console.error("[SpeechRecognition] Error aborting after error:", abortErr);
      }
      
      setError(`Speech recognition error: ${event.error}`);
      
      // Update imperative ref and state AFTER abort
      isListeningRef.current = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      const isMobile = isMobileDevice();
      const isIOS = isIOSDevice();
      console.log("[SpeechRecognition] Ended", {
        isMobile,
        isIOS,
        hasInterimResults: !!lastInterimTranscriptRef.current
      });
      
      // Mobile fix: Process any pending interim results immediately on end
      if (isMobile && lastInterimTranscriptRef.current) {
        console.log("[SpeechRecognition] Mobile: Processing interim transcript on end:", lastInterimTranscriptRef.current);
        setTranscript((prev) => prev + lastInterimTranscriptRef.current + " ");
      }
      
      // Clear any pending interim timeout
      if (interimTimeoutRef.current) {
        clearTimeout(interimTimeoutRef.current);
        interimTimeoutRef.current = null;
      }
      
      // Clear iOS silence timeout
      if (iosSilenceTimeoutRef.current) {
        clearTimeout(iosSilenceTimeoutRef.current);
        iosSilenceTimeoutRef.current = null;
      }
      lastInterimTranscriptRef.current = "";
      
      // Clear starting flag when recognition ends
      isStartingRef.current = false;
      
      // Update imperative ref for abort guards
      isListeningRef.current = false;
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      // Clear any pending startup timeout
      if (startupTimeoutRef.current) {
        clearTimeout(startupTimeoutRef.current);
        startupTimeoutRef.current = null;
      }
      
      // Clear any pending interim timeout
      if (interimTimeoutRef.current) {
        clearTimeout(interimTimeoutRef.current);
        interimTimeoutRef.current = null;
      }
      
      // Clear iOS silence timeout
      if (iosSilenceTimeoutRef.current) {
        clearTimeout(iosSilenceTimeoutRef.current);
        iosSilenceTimeoutRef.current = null;
      }
      
      if (recognitionRef.current) {
        console.log("[SpeechRecognition] Cleanup: aborting");
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const isMobile = isMobileDevice();
    const isIOS = isIOSDevice();
    
    console.log("[SpeechRecognition] startListening called", { 
      isListening, 
      isStarting: isStartingRef.current,
      hasRecognition: !!recognitionRef.current,
      isMobile,
      isIOS
    });
    
    // Clear any pending iOS silence timeout from previous session
    if (iosSilenceTimeoutRef.current) {
      clearTimeout(iosSilenceTimeoutRef.current);
      iosSilenceTimeoutRef.current = null;
    }
    
    // Guard: prevent starting if already listening or already starting
    if (isListening || isStartingRef.current) {
      console.warn("[SpeechRecognition] Already listening or starting, skipping start");
      return;
    }
    
    if (!recognitionRef.current) {
      console.error("[SpeechRecognition] Recognition not initialized");
      setError("Speech recognition not initialized");
      return;
    }

    // Set starting flag to prevent concurrent attempts
    isStartingRef.current = true;

    // CRITICAL: Abort any existing recognition session before starting new one
    // Use imperative ref to check actual listening state (not stale closure)
    try {
      if (recognitionRef.current && isListeningRef.current) {
        recognitionRef.current.abort();
        console.log("[SpeechRecognition] Aborted existing active session before starting");
      }
    } catch (abortErr) {
      // Ignore abort errors - may not be running
      console.warn("[SpeechRecognition] Error aborting existing session:", abortErr);
    }

    // Helper function to start recognition after Bluetooth initialization
    const doStartRecognition = () => {
      try {
        setTranscript("");
        setError(null);
        console.log("[SpeechRecognition] Calling recognition.start()");
        
        // Mobile devices need longer timeout due to permission dialogs and slower resource allocation
        // iOS Safari permission prompts can take 4-5 seconds, so use 5s timeout for mobile
        const timeout = isMobile ? 5000 : 2000;
        
        // Set timeout to detect if onstart never fires (microphone conflict)
        startupTimeoutRef.current = setTimeout(() => {
          console.error(`[SpeechRecognition] CRITICAL: onstart never fired after ${timeout}ms (microphone conflict)`);
          
          // CRITICAL FIX: Explicitly abort the recognition instance to release microphone
          // Always abort on timeout since recognition.start() was called but onstart never fired
          // This means the recognition is stuck in starting state and needs cleanup
          try {
            if (recognitionRef.current) {
              recognitionRef.current.abort();
              console.log("[SpeechRecognition] Aborted stuck recognition instance");
            }
          } catch (abortErr) {
            console.error("[SpeechRecognition] Error aborting recognition:", abortErr);
          }
          
          setError("Failed to start - microphone may still be in use");
          isListeningRef.current = false; // Update imperative ref
          setIsListening(false);
          isStartingRef.current = false; // Reset starting flag
        }, timeout);
        
        recognitionRef.current.start();
        // Note: setIsListening(true) is ONLY called in onstart event handler
        // This ensures state reflects actual recognition status, not optimistic assumption
      } catch (err: any) {
        // Clear timeout on immediate error
        if (startupTimeoutRef.current) {
          clearTimeout(startupTimeoutRef.current);
          startupTimeoutRef.current = null;
        }
        
        isStartingRef.current = false; // Reset starting flag
        
        // Ignore "already-started" error but set listening state
        if (err.message?.includes('already started')) {
          console.warn("[SpeechRecognition] Already started error caught - setting isListening to true");
          setIsListening(true);
          return;
        }
        console.error("[SpeechRecognition] Error starting recognition:", err);
        setError("Failed to start speech recognition");
      }
    };

    // Initialize Bluetooth/AirPods audio routing on mobile devices
    // This "primes" the audio subsystem to use connected Bluetooth devices
    if (isMobile) {
      initializeBluetoothAudio()
        .then(() => doStartRecognition())
        .catch(() => doStartRecognition()); // Still try even if Bluetooth init fails
    } else {
      doStartRecognition();
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    console.log("[SpeechRecognition] stopListening called", { 
      isListening, 
      hasRecognition: !!recognitionRef.current,
      hasPendingInterimResults: !!lastInterimTranscriptRef.current
    });
    
    // Clear any pending startup timeout
    if (startupTimeoutRef.current) {
      clearTimeout(startupTimeoutRef.current);
      startupTimeoutRef.current = null;
    }
    
    // Clear any pending interim timeout (but don't clear the interim transcript yet - let onend handle it)
    if (interimTimeoutRef.current) {
      clearTimeout(interimTimeoutRef.current);
      interimTimeoutRef.current = null;
    }
    
    // Clear iOS silence timeout
    if (iosSilenceTimeoutRef.current) {
      clearTimeout(iosSilenceTimeoutRef.current);
      iosSilenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current && isListening) {
      console.log("[SpeechRecognition] Calling recognition.stop()");
      recognitionRef.current.stop();
      // Note: lastInterimTranscriptRef will be processed and cleared in onend
      isListeningRef.current = false; // Update imperative ref
      setIsListening(false);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    transcript,
    isListening,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

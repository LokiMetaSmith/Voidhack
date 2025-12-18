import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { ConversationMessage, VoiceState, ChatRequest, ChatResponse, ShipSystemStatus } from "@shared/schema";
import { LCARSHeader } from "@/components/LCARSHeader";
import { VoiceControlPanel } from "@/components/VoiceControlPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { VoiceSettingsPanel, type VoiceSettings, type SoundSettings } from "@/components/VoiceSettings";
import { ShipSystemsPanel } from "@/components/ShipSystemsPanel";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useVoiceActivityDetection } from "@/hooks/useVoiceActivityDetection";
import { useTrekSounds } from "@/hooks/useTrekSounds";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Helper function to determine if continuous voice mode should be available
// Continuous mode uses Voice Activity Detection which has microphone conflicts on Android
const isContinuousModeAvailable = (): boolean => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isProduction = import.meta.env.PROD;

  // Disable continuous mode on mobile devices in production
  // Manual mic mode works reliably on all platforms
  if (isMobile && isProduction) {
    console.log("[Communicator] Continuous mode disabled on mobile production");
    return false;
  }

  return true;
};

export default function Communicator() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const continuousModeAvailable = isContinuousModeAvailable();
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(false);
  const [vadErrorCount, setVadErrorCount] = useState(0);
  const vadErrorCountRef = useRef(0);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem("voiceSettings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load voice settings:", e);
      }
    }
    return {
      voiceIndex: 0,
      rate: 0.9,  // Slightly slower for Star Trek computer style
      pitch: 1.0,  // Natural pitch
      volume: 1.0,
    };
  });

  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem("soundSettings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load sound settings:", e);
      }
    }
    return {
      enabled: true,
      volume: 0.4,
    };
  });

  const [shipSystems] = useState<ShipSystemStatus>({
    warpCore: { status: "Online", efficiency: 98 },
    shields: { status: "Online", strength: 100 },
    weapons: { status: "Online", ready: true },
    sensors: { status: "Online", range: 15 },
    lifesupport: { status: "Online", optimal: true },
    impulse: { status: "Online", power: 100 },
  });

  const { toast } = useToast();
  const { transcript, isListening, error: speechError, startListening, stopListening, resetTranscript } = useSpeechRecognition();
  const { speak, isSpeaking, cancel: cancelSpeech, warmUp: warmUpSpeech } = useSpeechSynthesis();
  const { playSound } = useTrekSounds(soundSettings);

  // Centralized VAD restart timer ref to prevent multiple concurrent restart attempts
  const vadRestartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // iOS fix: Track if we're currently processing a transcript to prevent duplicate sends
  const isProcessingTranscriptRef = useRef(false);

  // Voice Activity Detection for hands-free mode with enhanced error handling
  const {
    isVoiceDetected,
    audioLevel: vadAudioLevel,
    startDetection,
    stopDetection,
    permissionState,
    error: vadError
  } = useVoiceActivityDetection(
    0.02, // threshold
    () => {
      // On voice start - STOP VAD FIRST to prevent microphone conflict on Android
      console.log("[HandsFree] Voice detected, stopping VAD before starting Speech Recognition", {
        isListening,
        voiceState,
        isHandsFreeMode
      });
      if (isHandsFreeMode && !isListening && (voiceState === "idle" || voiceState === "processing")) {
        stopDetection(); // Critical: Stop VAD first to release microphone

        // Android needs longer delay in production to ensure microphone fully releases
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isProduction = import.meta.env.PROD;
        const handoffDelay = isMobile && isProduction ? 600 : 300;

        console.log(`[HandsFree] Waiting ${handoffDelay}ms before starting Speech Recognition`);
        setTimeout(() => {
          console.log("[HandsFree] Microphone released, starting Speech Recognition");
          startListening();
        }, handoffDelay);
      }
    },
    () => {
      // On voice end (after 1500ms silence)
      console.log("[HandsFree] Voice ended, stopping Speech Recognition");
      if (isHandsFreeMode && isListening) {
        stopListening();
      }
    },
    (error) => {
      // On VAD error - show user-visible error
      console.error("[HandsFree] VAD error:", error);

      // Increment error counter
      vadErrorCountRef.current += 1;
      setVadErrorCount(vadErrorCountRef.current);

      // Show error with retry suggestion on repeated failures
      if (vadErrorCountRef.current >= 2) {
        toast({
          title: "Voice Input Issue",
          description: "Having trouble with continuous mode? Try using manual mic mode instead (single tap on microphone button).",
          variant: "destructive",
        });

        // Disable hands-free mode after repeated failures
        console.log("[HandsFree] Multiple VAD errors, disabling hands-free mode");
        setIsHandsFreeMode(false);
        vadErrorCountRef.current = 0;
        setVadErrorCount(0);
      } else {
        toast({
          title: "Microphone Access Error",
          description: error,
          variant: "destructive",
        });
      }

      // Disable hands-free mode if permission denied
      if (permissionState === 'denied') {
        console.log("[HandsFree] Permission denied, disabling hands-free mode");
        setIsHandsFreeMode(false);
      }
    }
  );

  // Refs for Media Session handlers to access latest state
  const isListeningRef = useRef(isListening);
  const voiceStateRef = useRef(voiceState);
  const startListeningRef = useRef(startListening);
  const stopListeningRef = useRef(stopListening);
  const warmUpSpeechRef = useRef(warmUpSpeech);
  const cancelSpeechRef = useRef(cancelSpeech);
  const playSoundRef = useRef(playSound);
  const mediaSessionActiveRef = useRef(false);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Keep refs updated
  useEffect(() => {
    isListeningRef.current = isListening;
    voiceStateRef.current = voiceState;
    startListeningRef.current = startListening;
    stopListeningRef.current = stopListening;
    warmUpSpeechRef.current = warmUpSpeech;
    cancelSpeechRef.current = cancelSpeech;
    playSoundRef.current = playSound;
  }, [isListening, voiceState, startListening, stopListening, warmUpSpeech, cancelSpeech, playSound]);

  // Function to activate Media Session by playing silent audio
  // iOS Safari requires actual audio playback initiated by user gesture
  const activateMediaSession = useCallback(() => {
    if (mediaSessionActiveRef.current) {
      console.log("[MediaSession] Already activated");
      return;
    }

    if (!('mediaSession' in navigator)) {
      console.log("[MediaSession] API not available");
      return;
    }

    console.log("[MediaSession] Activating with silent audio...");

    try {
      // Create a silent audio element with a data URI (silent MP3)
      // This is a minimal valid MP3 file that is silent
      const silentMp3 = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAGAAGn9AAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//tQxBgAAADSAAAAAAAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

      const audio = new Audio(silentMp3);
      audio.loop = true;
      audio.volume = 0.01; // Nearly silent but not zero (some browsers ignore zero volume)
      silentAudioRef.current = audio;

      // Set up Media Session metadata
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'USS Enterprise Computer',
        artist: 'Voice Interface',
        album: 'Star Trek',
      });

      // Play the silent audio to activate Media Session
      audio.play().then(() => {
        console.log("[MediaSession] Silent audio playing, session activated");
        mediaSessionActiveRef.current = true;

        // Set initial playback state
        navigator.mediaSession.playbackState = 'paused';
      }).catch((err) => {
        console.error("[MediaSession] Failed to play silent audio:", err);
      });

    } catch (error) {
      console.error("[MediaSession] Error activating:", error);
    }
  }, []);

  // Media Session API for AirPods/Bluetooth hardware tap gestures
  // When user taps AirPods, it triggers play/pause media events that we capture
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      console.log("[MediaSession] API not available in this browser");
      return;
    }

    console.log("[MediaSession] Setting up AirPods/Bluetooth hardware button handlers");

    // Handle play action (single tap on AirPods activates mic)
    const handlePlay = () => {
      console.log("[MediaSession] Play action received (AirPod tap detected)");

      // If already listening, ignore
      if (isListeningRef.current) {
        console.log("[MediaSession] Already listening, ignoring play action");
        return;
      }

      // If currently speaking, stop speech first
      if (voiceStateRef.current === 'speaking') {
        console.log("[MediaSession] Canceling speech before starting mic");
        cancelSpeechRef.current();
      }

      // Activate microphone
      console.log("[MediaSession] Activating microphone via AirPod tap");
      isProcessingTranscriptRef.current = false;
      playSoundRef.current("activate");
      warmUpSpeechRef.current();
      startListeningRef.current();
    };

    // Handle pause action (tap while listening stops mic)
    const handlePause = () => {
      console.log("[MediaSession] Pause action received (AirPod tap detected)");

      if (isListeningRef.current) {
        console.log("[MediaSession] Stopping microphone via AirPod tap");
        stopListeningRef.current();
      }
    };

    // Handle stop action (some devices use this)
    const handleStop = () => {
      console.log("[MediaSession] Stop action received");
      if (isListeningRef.current) {
        stopListeningRef.current();
      }
    };

    try {
      navigator.mediaSession.setActionHandler('play', handlePlay);
      navigator.mediaSession.setActionHandler('pause', handlePause);
      navigator.mediaSession.setActionHandler('stop', handleStop);

      console.log("[MediaSession] Handlers registered successfully");
    } catch (error) {
      console.error("[MediaSession] Error setting up handlers:", error);
    }

    // Cleanup on unmount
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);

        // Stop and cleanup silent audio
        if (silentAudioRef.current) {
          silentAudioRef.current.pause();
          silentAudioRef.current = null;
        }
        mediaSessionActiveRef.current = false;

        console.log("[MediaSession] Handlers cleaned up");
      } catch (error) {
        console.error("[MediaSession] Error cleaning up handlers:", error);
      }
    };
  }, []);

  // Update Media Session playback state based on voice state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!mediaSessionActiveRef.current) return;

    // When listening, set to 'playing' so next tap triggers 'pause'
    // When idle/processing/speaking, set to 'paused' so tap triggers 'play'
    if (isListening) {
      navigator.mediaSession.playbackState = 'playing';
      console.log("[MediaSession] Playback state: playing (listening)");
    } else {
      navigator.mediaSession.playbackState = 'paused';
      console.log("[MediaSession] Playback state: paused (not listening)");
    }
  }, [isListening]);

  // Load existing conversation on mount
  useEffect(() => {
    const loadConversation = async () => {
      const savedConversationId = localStorage.getItem("currentConversationId");
      if (savedConversationId) {
        try {
          const response = await fetch(`/api/conversations/${savedConversationId}/messages`);
          if (response.ok) {
            const data = await response.json();
            setMessages(data.messages);
            setConversationId(savedConversationId);
          }
        } catch (error) {
          console.error("Failed to load conversation:", error);
        }
      }
    };
    loadConversation();
  }, []);

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (request: ChatRequest) => {
      const response = await apiRequest("POST", "/api/chat", request);
      return await response.json() as ChatResponse;
    },
    onSuccess: (data) => {
      if (!data.message) {
        toast({
          title: "Response Error",
          description: "Received empty response from computer",
          variant: "destructive",
        });
        setVoiceState("idle");
        return;
      }

      // Update conversation ID if this is the first message
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
        // Store in localStorage for session persistence
        localStorage.setItem("currentConversationId", data.conversationId);
      }

      const computerMessage: ConversationMessage = {
        id: data.messageId,
        role: "computer",
        text: data.message,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, computerMessage]);

      // Speak the response
      console.log("[Communicator] Calling speak() with message:", data.message.substring(0, 50));
      speak(data.message, voiceSettings);
    },
    onError: (error) => {
      playSound("error");
      toast({
        title: "Communication Error",
        description: error.message || "Failed to process your request",
        variant: "destructive",
      });
      setVoiceState("idle");

      // Restart VAD if in hands-free mode (even on error)
      if (isHandsFreeMode) {
        setTimeout(() => {
          console.log("[HandsFree] Error occurred, restarting VAD for next input");
          startDetection();
        }, 1000);
      }
    },
  });

  // Handle speech recognition
  useEffect(() => {
    if (isListening) {
      setVoiceState("listening");
      playSound("listening");
      // Simulate audio level for visualization
      const interval = setInterval(() => {
        setAudioLevel(Math.random());
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isListening, playSound]);

  // Handle speech synthesis
  useEffect(() => {
    console.log("[HandsFree] Speech synthesis state:", {
      isSpeaking,
      voiceState,
      isHandsFreeMode
    });

    if (isSpeaking) {
      setVoiceState("speaking");
    } else if (voiceState === "speaking") {
      console.log("[HandsFree] Speech completed, preparing to restart VAD");
      playSound("complete");
      setVoiceState("idle");

      // Restart VAD after speaking completes in hands-free mode
      if (isHandsFreeMode) {
        // Cancel any pending restart timer
        if (vadRestartTimerRef.current) {
          clearTimeout(vadRestartTimerRef.current);
          vadRestartTimerRef.current = null;
        }

        // Ensure VAD is fully stopped before restarting
        stopDetection();

        vadRestartTimerRef.current = setTimeout(() => {
          console.log("[HandsFree] Restarting VAD for next detection cycle");
          startDetection();
          vadRestartTimerRef.current = null;
        }, 700); // Increased delay to ensure cleanup completes
      }
    }
  }, [isSpeaking, voiceState, playSound, isHandsFreeMode, startDetection, stopDetection]);

  // Failsafe: If speech synthesis doesn't start within 3s of processing, reset to idle
  useEffect(() => {
    if (voiceState !== "processing") {
      return;
    }

    const speechStartTimeout = setTimeout(() => {
      if (voiceState === "processing" && !isSpeaking) {
        console.warn("[HandsFree] Speech synthesis timeout - resetting to idle");
        playSound("complete");
        setVoiceState("idle");

        // Restart VAD if in hands-free mode
        if (isHandsFreeMode) {
          setTimeout(() => {
            console.log("[HandsFree] Timeout recovery: Restarting VAD");
            startDetection();
          }, 500);
        }
      }
    }, 3000); // 3 second timeout

    return () => clearTimeout(speechStartTimeout);
  }, [voiceState, isSpeaking, isHandsFreeMode, playSound, startDetection]);

  // Defensive timeout: Restart VAD if speech synthesis fails to start
  useEffect(() => {
    if (!isHandsFreeMode || voiceState !== "idle" || isSpeaking) {
      return;
    }

    // If we're in hands-free mode, idle state, and not speaking, ensure VAD restarts
    const failsafeTimeout = setTimeout(() => {
      console.log("[HandsFree] Failsafe: Ensuring VAD is active in idle state");
      if (!isSpeaking && !isListening && !isVoiceDetected && voiceState === "idle" && isHandsFreeMode) {
        // Cancel any pending restart timer before starting new one
        if (vadRestartTimerRef.current) {
          clearTimeout(vadRestartTimerRef.current);
          vadRestartTimerRef.current = null;
        }
        console.log("[HandsFree] Failsafe: Restarting VAD");
        startDetection();
      }
    }, 3000); // Wait 3 seconds before failsafe triggers

    return () => clearTimeout(failsafeTimeout);
  }, [isHandsFreeMode, voiceState, isSpeaking, isListening, isVoiceDetected, startDetection]);

  // Handle hands-free mode toggle
  useEffect(() => {
    // CRITICAL GUARD: Prevent VAD activation when continuous mode is unavailable
    if (isHandsFreeMode && !continuousModeAvailable) {
      console.error("[HandsFree] Attempted to activate VAD on unsupported platform, disabling");
      setIsHandsFreeMode(false);
      return;
    }

    if (isHandsFreeMode) {
      // Cancel any pending restart timer
      if (vadRestartTimerRef.current) {
        clearTimeout(vadRestartTimerRef.current);
        vadRestartTimerRef.current = null;
      }

      // Stop any active speech recognition before starting VAD
      if (isListening) {
        stopListening();
      }
      // Small delay to ensure cleanup completes
      const timer = setTimeout(() => {
        startDetection();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Cancel any pending restart timer when disabling hands-free
      if (vadRestartTimerRef.current) {
        clearTimeout(vadRestartTimerRef.current);
        vadRestartTimerRef.current = null;
      }
      stopDetection();
    }
  }, [isHandsFreeMode, continuousModeAvailable, startDetection, stopDetection, isListening, stopListening]);

  // Handle transcript changes - iOS FIX: Remove voiceState dependency
  // On iOS Safari, voiceState can be reset to "idle" by error handlers before
  // the transcript is processed, causing the message to never be sent.
  // The key conditions are: we have a transcript AND we're no longer listening.
  useEffect(() => {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    console.log("[Communicator] Transcript effect triggered", {
      transcript: transcript ? transcript.substring(0, 30) + "..." : "(empty)",
      isListening,
      voiceState,
      isProcessing: isProcessingTranscriptRef.current,
      isIOS
    });

    // Process transcript when: we have text, stopped listening, and not already processing
    if (transcript && !isListening && !isProcessingTranscriptRef.current) {
      console.log("[Communicator] Processing transcript:", transcript);
      isProcessingTranscriptRef.current = true;
      handleUserMessage(transcript);
      // Reset processing flag after a short delay to allow for next interaction
      setTimeout(() => {
        isProcessingTranscriptRef.current = false;
      }, 500);
    }
  }, [transcript, isListening]);

  // Handle speech errors - CRITICAL FIX for mobile microphone issues
  useEffect(() => {
    if (speechError) {
      console.error("[Communicator] Speech error detected:", speechError);

      // CRITICAL: Force reset voice state to idle to sync UI with actual state
      setVoiceState("idle");

      // Stop any active listening to ensure clean state
      if (isListening) {
        console.log("[Communicator] Forcing stop listening due to error");
        stopListening();
      }

      // ONLY manage VAD if in hands-free mode to avoid unnecessary mic toggling
      if (isHandsFreeMode) {
        // Stop VAD to release microphone
        stopDetection();

        // Schedule VAD restart after error recovery delay
        console.log("[Communicator] Scheduling VAD restart after error (hands-free mode)");
        setTimeout(() => {
          console.log("[Communicator] Restarting VAD after error recovery");
          startDetection();
        }, 1500); // Give extra time for mobile to fully release resources
      }

      toast({
        title: "Voice Input Error",
        description: speechError,
        variant: "destructive",
      });
    }
  }, [speechError, toast, isHandsFreeMode, isListening, stopListening, stopDetection, startDetection]);

  // Android/Mobile safeguard: Timeout to reset stuck listening state
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isHandsFreeMode && voiceState === 'listening' && isMobile) {
      console.log("[HandsFree] Mobile browser detected, starting stuck state timeout");

      // If listening state persists for too long, force reset (Android issue workaround)
      const stuckTimeout = setTimeout(() => {
        console.error("[HandsFree] Listening state stuck for 15s, forcing reset (Android issue)");

        // Force stop speech recognition
        stopListening();
        setVoiceState('idle');

        // Restart VAD for next detection cycle
        if (isHandsFreeMode) {
          setTimeout(() => {
            console.log("[HandsFree] Restarting VAD after stuck state reset");
            startDetection();
          }, 500);
        }

        toast({
          title: "Voice Input Reset",
          description: "Restarted voice detection due to timeout",
          variant: "default",
        });
      }, 15000); // 15 second timeout

      return () => clearTimeout(stuckTimeout);
    }
  }, [isHandsFreeMode, voiceState, stopListening, startDetection, toast]);

  const handleToggleContinuousMode = () => {
    // Guard: continuous mode not available on Android production
    if (!continuousModeAvailable) {
      console.log("[Communicator] Continuous mode not available on this platform");
      toast({
        title: "Continuous Mode Unavailable",
        description: "Continuous voice mode is not available on mobile devices. Please use manual mic mode (tap the microphone button to speak).",
        variant: "default",
      });
      return;
    }

    if (isHandsFreeMode) {
      console.log("[Communicator] Continuous mode button clicked - deactivating");
      setIsHandsFreeMode(false);
      stopDetection();
      if (isListening) {
        stopListening();
      }
      cancelSpeech();
      // Reset error counter when user manually disables
      vadErrorCountRef.current = 0;
      setVadErrorCount(0);
    } else {
      console.log("[Communicator] Continuous mode button clicked - activating");
      playSound("activate");
      warmUpSpeech();
      activateMediaSession(); // Activate Media Session for AirPod tap gestures
      setIsHandsFreeMode(true);
      vadErrorCountRef.current = 0;
      setVadErrorCount(0);
    }
  };

  const handleStartListening = () => {
    console.log("[Communicator] Manual mic button clicked - starting listening");
    isProcessingTranscriptRef.current = false;
    playSound("activate");
    cancelSpeech();
    warmUpSpeech();
    activateMediaSession(); // Activate Media Session for AirPod tap gestures
    startListening();
  };

  const handleStopListening = () => {
    console.log("[Communicator] Manual mic button clicked - stopping listening");
    stopListening();
  };

  const handleUserMessage = (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setVoiceState("idle");
      resetTranscript();
      return;
    }

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmedText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setVoiceState("processing");
    playSound("processing");

    chatMutation.mutate({
      message: trimmedText,
      conversationId: conversationId || undefined,
      conversationHistory: messages,
      shipSystems: shipSystems,
    });

    resetTranscript();
  };

  const handleClearConversation = async () => {
    if (conversationId) {
      try {
        await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      } catch (error) {
        console.error("Failed to delete conversation:", error);
      }
    }

    setMessages([]);
    setConversationId(null);
    setVoiceState("idle");
    cancelSpeech();
    resetTranscript();
    localStorage.removeItem("currentConversationId");
  };

  // Defensive wrapper for hands-free mode changes
  // Prevents enabling continuous mode when platform doesn't support it
  const handleHandsFreeModeChange = (enabled: boolean) => {
    if (enabled && !continuousModeAvailable) {
      console.warn("[Communicator] Attempted to enable hands-free mode on unsupported platform");
      toast({
        title: "Continuous Mode Unavailable",
        description: "Continuous voice mode is not available on mobile devices. Please use manual mic mode (tap the microphone button to speak).",
        variant: "default",
      });
      return;
    }
    setIsHandsFreeMode(enabled);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <LCARSHeader
        onClearConversation={messages.length > 0 ? handleClearConversation : undefined}
        isHandsFreeMode={isHandsFreeMode}
        onHandsFreeModeChange={continuousModeAvailable ? handleHandsFreeModeChange : undefined}
        voiceSettingsButton={
          <VoiceSettingsPanel
            onSettingsChange={setVoiceSettings}
            onSoundSettingsChange={setSoundSettings}
          />
        }
      />

      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        <div className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl">
          <div className="w-full">
            <StatusIndicator state={voiceState} />
          </div>

          <div className="w-full">
            <ShipSystemsPanel systems={shipSystems} />
          </div>

          <div className="w-full flex justify-center">
            <VoiceControlPanel
              voiceState={voiceState}
              onStartListening={handleStartListening}
              onStopListening={handleStopListening}
              onToggleContinuousMode={handleToggleContinuousMode}
              isContinuousModeActive={isHandsFreeMode}
              audioLevel={audioLevel}
              permissionState={permissionState}
              continuousModeAvailable={continuousModeAvailable}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

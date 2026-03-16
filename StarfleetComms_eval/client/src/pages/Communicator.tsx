import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { ConversationMessage, VoiceState, ChatRequest, ChatResponse, ShipSystemStatus } from "@shared/schema";
import { LCARSHeader } from "@/components/LCARSHeader";
import { VoiceControlPanel } from "@/components/VoiceControlPanel";
import { ConversationDisplay } from "@/components/ConversationDisplay";
import { StatusIndicator } from "@/components/StatusIndicator";
import { VoiceSettingsPanel, type VoiceSettings, type SoundSettings } from "@/components/VoiceSettings";
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

const MAIN_SCHEDULE = [
  {
    room: "North Room",
    sessions: [
      { time: "09:00am - 10:00am", title: "Securing Small & Mid-Sized Enterprises - Defensible Security on a Shoestring", speaker: "Kumuda Sreenivasa" },
      { time: "10:00am - 11:00am", title: "Offensive Threat Models Against AI Systems", speaker: "Tony UV" },
      { time: "11:00am - 12:00pm", title: "I'm in Danger - From Alert Chaos to CTEM", speaker: "Steven Lykins, Courtney Burr" },
      { time: "01:00pm - 02:00pm", title: "Extending Shared Threat Models with the Application Attack Matrix", speaker: "J Fridley" },
      { time: "02:00pm - 03:00pm", title: "A Fistful of Headers - Taming the Wild Web at Scale", speaker: "Cary Hooper" },
      { time: "03:00pm - 04:00pm", title: "Why Disaster Recovery Is NOT Cyber Recovery", speaker: "Gregg Robbins" },
    ],
  },
  {
    room: "South Room",
    sessions: [
      { time: "09:00am - 10:00am", title: "Acts of God - How Cybercriminals Leverage AI to Exploit Breaking News", speaker: "Andre Piazza" },
      { time: "10:00am - 11:00am", title: "How to Combat Digital Deception - A Guide to Deepfakes", speaker: "Trevor Wiseman" },
      { time: "11:00am - 12:00pm", title: "Burned-Out Admins - Your Most Exploitable Vulnerability", speaker: "Stephen Engler" },
      { time: "01:00pm - 02:00pm", title: "Hunting Smarter, Not Harder - Building Threat Hunting Pipelines with Python (Featuring ESXi Hunting)", speaker: "James Honeycutt" },
      { time: "02:00pm - 03:00pm", title: "Beyond the Prompt - The New Threat Surface of Vibe‑Coded Apps", speaker: "Yotam Perkal, Gil Maman" },
      { time: "03:00pm - 04:00pm", title: "Death By (Python) Pickle - \"Betrayal ML\"", speaker: "Andy Lewis" },
    ],
  },
  {
    room: "Center Room",
    sessions: [
      { time: "09:00am - 10:00am", title: "How to steal a network", speaker: "Andrew Lemon" },
      { time: "10:00am - 11:00am", title: "Hardening the OS - Fighting 0-Days with Modern Exploit Defenses", speaker: "Michael Oglesby" },
      { time: "11:00am - 12:00pm", title: "Operation Moonlander - Dismantling the Anyproxy/5socks Botnet", speaker: "Camron Borders" },
      { time: "01:00pm - 02:00pm", title: "The Mentor's Roadmap to Your Cyber Career", speaker: "Kris Wall" },
      { time: "02:00pm - 03:00pm", title: "Hacking Unpacked - This Year's Most Interesting Breaches, Mapped to Real Controls", speaker: "Geoff Wilson" },
      { time: "03:00pm - 04:00pm", title: "The CISO as Diplomat - Surviving the Political Battlefield of IT", speaker: "Jonathan Kimmitt" },
    ],
  },
];

export default function Communicator() {
  const [activeTab, setActiveTab] = useState<'computer' | 'schedule' | 'rank' | 'ctfs'>("computer");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const continuousModeAvailable = isContinuousModeAvailable();
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(false);
  const [vadErrorCount, setVadErrorCount] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [uiErrors, setUiErrors] = useState<Array<{ id: string; message: string; timestamp: number }>>([]);
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
  const { transcript, interimTranscript, isListening, error: speechError, startListening, stopListening, resetTranscript } = useSpeechRecognition();
  const lastHandledErrorRef = useRef<string | null>(null);

  const addUiError = useCallback((message: string) => {
    const err = { id: `err-${Date.now()}`, message, timestamp: Date.now() };
    setUiErrors((prev) => [...prev.slice(-4), err]);
  }, []);

  const dismissUiError = useCallback((id: string) => {
    setUiErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);
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
      const errMsg = error.message || "Failed to process your request";
      addUiError(errMsg);
      toast({
        title: "Communication Error",
        description: errMsg,
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
    if (speechError && speechError !== lastHandledErrorRef.current) {
      lastHandledErrorRef.current = speechError;
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

      addUiError(speechError);
      toast({
        title: "Voice Input Error",
        description: speechError,
        variant: "destructive",
      });
    }
  }, [speechError, toast, addUiError, isHandsFreeMode, isListening, stopListening, stopDetection, startDetection]);

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

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || voiceState === "processing" || voiceState === "speaking" || isListening) return;
    handleUserMessage(trimmed);
    setTextInput("");
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUserId.trim()) {
      setLoginError("User ID is required.");
      return;
    }
    if (loginPassword.length < 8 || loginPassword.length > 25) {
      setLoginError("Password must be 8–25 characters.");
      return;
    }
    setLoginError("");
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    setLoginUserId("");
    setLoginPassword("");
    setLoginError("");
    setShowPassword(false);
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: '#000' }}>
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
        isAuthenticated={isAuthenticated}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex overflow-hidden" style={{ gap: '10px', padding: '10px' }}>
        <div className="hidden sm:flex flex-col gap-1.5 flex-shrink-0" style={{ width: '140px' }}>
          <button
            className="flex items-center justify-end px-3 font-bold text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: activeTab === 'schedule' ? 'var(--lcars-orange)' : 'var(--lcars-blue)',
              color: '#000',
              height: '50px',
              borderRadius: '25px 0 0 25px',
            }}
            onClick={() => setActiveTab('schedule')}
          >
            SCHEDULE
          </button>
          <button
            className="flex items-center justify-end px-3 font-bold text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: activeTab === 'computer' ? 'var(--lcars-orange)' : 'var(--lcars-blue)',
              color: '#000',
              height: '50px',
              borderRadius: '25px 0 0 25px',
            }}
            onClick={() => setActiveTab('computer')}
          >
            COMPUTER
          </button>
          <button
            className="flex items-center justify-end px-3 font-bold text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: activeTab === 'rank' ? 'var(--lcars-orange)' : 'var(--lcars-blue)',
              color: '#000',
              height: '50px',
              borderRadius: '25px 0 0 25px',
            }}
            onClick={() => setActiveTab('rank')}
          >
            RANK
          </button>
          <button
            className="flex items-center justify-end px-3 font-bold text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: activeTab === 'ctfs' ? 'var(--lcars-orange)' : 'var(--lcars-blue)',
              color: '#000',
              height: '50px',
              borderRadius: '25px 0 0 25px',
            }}
            onClick={() => setActiveTab('ctfs')}
          >
            CTFs
          </button>
          <div className="flex-1" style={{ backgroundColor: 'var(--lcars-purple)', borderRadius: '0 0 0 25px', minHeight: '40px' }} />
        </div>

        <div
          className="flex-1 flex flex-col overflow-hidden rounded-2xl"
          style={{ border: '2px solid var(--lcars-orange)', backgroundColor: '#000' }}
        >
          {!isAuthenticated ? (
            <div className="flex-1 flex items-center justify-center">
              <form
                onSubmit={handleLogin}
                className="flex flex-col gap-4 w-72 font-mono"
              >
                <div
                  className="text-center text-xs font-bold tracking-widest uppercase mb-2"
                  style={{ color: 'var(--lcars-orange)' }}
                >
                  AUTHORIZATION REQUIRED
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>
                    User ID
                  </label>
                  <input
                    type="text"
                    value={loginUserId}
                    onChange={(e) => setLoginUserId(e.target.value)}
                    autoComplete="username"
                    className="bg-transparent border-b px-2 py-1 text-sm outline-none"
                    style={{
                      borderColor: 'var(--lcars-orange)',
                      color: 'var(--lcars-orange)',
                      caretColor: 'var(--lcars-orange)',
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>
                    Password (8–25 characters)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                      maxLength={25}
                      className="bg-transparent border-b px-2 py-1 text-sm outline-none flex-1 pr-8"
                      style={{
                        borderColor: 'var(--lcars-orange)',
                        color: 'var(--lcars-orange)',
                        caretColor: 'var(--lcars-orange)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 text-xs uppercase tracking-wider"
                      style={{ color: 'var(--lcars-blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>
                {loginError && (
                  <div className="text-xs text-center" style={{ color: 'var(--lcars-red)' }}>
                    {loginError}
                  </div>
                )}
                <button
                  type="submit"
                  className="mt-2 py-2 text-sm font-bold uppercase tracking-widest rounded"
                  style={{
                    backgroundColor: 'var(--lcars-orange)',
                    color: '#000',
                  }}
                >
                  ACCESS
                </button>
              </form>
            </div>
          ) : (activeTab === 'rank' || activeTab === 'ctfs') ? (
            <div className="flex-1 flex items-center justify-center font-mono">
              <span
                className="text-2xl font-bold tracking-widest uppercase"
                style={{ color: 'var(--lcars-orange)' }}
              >
                PENDING
              </span>
            </div>
          ) : activeTab === 'schedule' ? (
            <div className="flex-1 overflow-y-auto p-4 font-mono">
              <div
                className="text-center text-xs font-bold tracking-widest uppercase mb-4"
                style={{ color: 'var(--lcars-orange)' }}
              >
                Session Schedule
              </div>
              {MAIN_SCHEDULE.map((room) => (
                <div key={room.room} className="mb-6">
                  <div
                    className="text-sm font-bold uppercase tracking-widest mb-2 px-2 py-1 rounded"
                    style={{
                      backgroundColor: 'var(--lcars-blue)',
                      color: '#000',
                      display: 'inline-block',
                    }}
                  >
                    {room.room}
                  </div>
                  <div className="space-y-2 mt-2">
                    {room.sessions.map((session, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 rounded"
                        style={{
                          backgroundColor: 'rgba(153, 153, 255, 0.07)',
                          border: '1px solid var(--lcars-blue)',
                        }}
                      >
                        <div
                          className="text-xs font-bold tracking-wider mb-0.5"
                          style={{ color: 'var(--lcars-orange)' }}
                        >
                          {session.time}
                        </div>
                        <div
                          className="text-sm font-semibold mb-0.5"
                          style={{ color: 'var(--lcars-light-blue)' }}
                        >
                          {session.title}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: 'var(--lcars-blue)' }}
                        >
                          {session.speaker}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col overflow-y-auto p-4">
                <div className="w-full max-w-2xl mx-auto mb-2">
                  <StatusIndicator state={voiceState} />
                </div>

                {uiErrors.length > 0 && (
                  <div className="w-full max-w-2xl mx-auto mb-2 space-y-1">
                    {uiErrors.map((err) => (
                      <div
                        key={err.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded text-sm font-mono"
                        style={{
                          backgroundColor: 'rgba(204, 0, 0, 0.15)',
                          border: '1px solid var(--lcars-red)',
                          color: 'var(--lcars-red)',
                        }}
                      >
                        <span className="flex-1 break-words">{err.message}</span>
                        <button
                          onClick={() => dismissUiError(err.id)}
                          className="flex-shrink-0 text-xs uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{
                            color: 'var(--lcars-red)',
                            border: '1px solid var(--lcars-red)',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto mb-4">
                  <ConversationDisplay messages={messages} />
                </div>

                {isListening && (transcript || interimTranscript) && (
                  <div
                    className="w-full max-w-2xl mx-auto mb-2 px-4 py-3 rounded-md font-mono text-sm"
                    style={{
                      backgroundColor: 'rgba(153, 153, 255, 0.1)',
                      border: '1px solid var(--lcars-blue)',
                      color: 'var(--lcars-light-blue)',
                    }}
                  >
                    <span className="text-xs font-bold tracking-widest uppercase block mb-1" style={{ color: 'var(--lcars-blue)' }}>
                      VOICE INPUT
                    </span>
                    {transcript}
                    {interimTranscript && (
                      <span style={{ opacity: 0.6 }}>{interimTranscript}</span>
                    )}
                    <span className="inline-block w-1.5 h-4 ml-1 animate-pulse" style={{ backgroundColor: 'var(--lcars-blue)' }} />
                  </div>
                )}

                <div className="w-full max-w-2xl mx-auto flex justify-center">
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

              <div
                className="flex-shrink-0 px-4 py-2"
                style={{ borderTop: '2px solid var(--lcars-orange)' }}
              >
                <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                  <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--lcars-orange)' }}>
                    CMD&gt;
                  </span>
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type a command..."
                    disabled={voiceState === "processing" || voiceState === "speaking" || isListening}
                    className="flex-1 bg-transparent font-mono text-sm outline-none"
                    style={{
                      color: 'var(--lcars-orange)',
                      border: 'none',
                      caretColor: 'var(--lcars-orange)',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!textInput.trim() || voiceState === "processing" || voiceState === "speaking" || isListening}
                    className="font-mono text-xs uppercase tracking-wider px-3 py-1 rounded transition-opacity"
                    style={{
                      color: '#000',
                      backgroundColor: 'var(--lcars-orange)',
                      opacity: !textInput.trim() || voiceState === "processing" || voiceState === "speaking" || isListening ? 0.4 : 1,
                      cursor: !textInput.trim() || voiceState === "processing" || voiceState === "speaking" || isListening ? 'not-allowed' : 'pointer',
                    }}
                  >
                    SEND
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

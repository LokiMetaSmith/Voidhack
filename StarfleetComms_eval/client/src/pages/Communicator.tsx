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
import { apiRequest, authHeaders } from "@/lib/queryClient";
import { Info, Calendar, Cpu, Star, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
      { time: "10:00am - 11:00am", title: "Hardening the OS: Fighting 0-Days with Modern Exploit Defenses", speaker: "Michael Oglesby" },
      { time: "11:00am - 12:00pm", title: "I'm in Danger - From Alert Chaos to CTEM", speaker: "Steven Lykins, Courtney Burr" },
      { time: "01:00pm - 02:00pm", title: "Extending Shared Threat Models with the Application Attack Matrix", speaker: "J Fridley" },
      { time: "02:00pm - 03:00pm", title: "A Fistful of Headers - Taming the Wild Web at Scale", speaker: "Cary Hooper" },
      { time: "03:00pm - 04:00pm", title: "Why Disaster Recovery Is NOT Cyber Recovery", speaker: "Gregg Robbins" },
    ],
  },
  {
    room: "Center Room",
    sessions: [
      { time: "09:00am - 10:00am", title: "How to steal a network", speaker: "Andrew Lemon" },
      { time: "10:00am - 11:00am", title: "The Adversary Doesn't Care About Your Compliance Score", speaker: "Ian Anderson" },
      { time: "11:00am - 12:00pm", title: "Operation Moonlander - Dismantling the Anyproxy/5socks Botnet", speaker: "Camron Borders" },
      { time: "01:00pm - 02:00pm", title: "The Mentor's Roadmap to Your Cyber Career", speaker: "Kris Wall" },
      { time: "02:00pm - 03:00pm", title: "Hacking Unpacked - This Year's Most Interesting Breaches, Mapped to Real Controls", speaker: "Geoff Wilson" },
      { time: "03:00pm - 04:00pm", title: "The CISO as Diplomat - Surviving the Political Battlefield of IT", speaker: "Jonathan Kimmitt" },
    ],
  },
  {
    room: "South Room",
    sessions: [
      { time: "09:00am - 10:00am", title: "Acts of God - How Cybercriminals Leverage AI to Exploit Breaking News", speaker: "Andre Piazza" },
      { time: "10:00am - 11:00am", title: "Offensive Engineering: Applying DevOps Principles to Offensive Security", speaker: "Sharrone Berry-Davis" },
      { time: "11:00am - 12:00pm", title: "Burned-Out Admins - Your Most Exploitable Vulnerability", speaker: "Stephen Engler" },
      { time: "01:00pm - 02:00pm", title: "Hunting Smarter, Not Harder - Building Threat Hunting Pipelines with Python (Featuring ESXi Hunting)", speaker: "James Honeycutt" },
      { time: "02:00pm - 03:00pm", title: "Hide, Obfuscate, Destroy - Techniques and Implications of Anti-Forensics", speaker: "Andrew Peters" },
      { time: "03:00pm - 04:00pm", title: "Death By (Python) Pickle - \"Betrayal ML\"", speaker: "Andy Lewis" },
    ],
  },
];

function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c >= 'a' ? 97 : 65;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export default function Communicator() {
  const [activeTab, setActiveTab] = useState<'computer' | 'schedule' | 'rank' | 'ctfs' | 'account'>("schedule");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [userIdTouched, setUserIdTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regUserId, setRegUserId] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [regUserIdTouched, setRegUserIdTouched] = useState(false);
  const [regPasswordTouched, setRegPasswordTouched] = useState(false);
  const [userXp, setUserXp] = useState(0);
  const [userRank, setUserRank] = useState("Cadet");
  const [rankView, setRankView] = useState<'my-record' | 'leaderboard'>('my-record');
  const [leaderboard, setLeaderboard] = useState<Array<{ position: number; userId: string; xp: number; rank: string }>>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [activeCTF, setActiveCTF] = useState<number | null>(null);
  const [klingonHintLevel, setKlingonHintLevel] = useState(0);
  const [klingonShowFrequency, setKlingonShowFrequency] = useState(false);
  const [klingonDecryptInput, setKlingonDecryptInput] = useState('');
  const [klingonFlagInput, setKlingonFlagInput] = useState('');
  const [klingonFlagResult, setKlingonFlagResult] = useState<'correct' | 'incorrect' | null>(null);
  // Tracks challenges confirmed complete by the DB — never downgrade on page reload
  const [dbCompletedCTF, setDbCompletedCTF] = useState<Record<string, boolean>>({});
  const [klingonProgress, setKlingonProgress] = useState({ analyzed: false, identified: false, decoded: false });
  const [holodeckUsername, setHolodeckUsername] = useState('');
  const [holodeckPassword, setHolodeckPassword] = useState('');
  const [holodeckAttempts, setHolodeckAttempts] = useState(0);
  const [holodeckScreen, setHolodeckScreen] = useState<'login' | 'programs' | 'archive'>('login');
  const [holodeckLoginMsg, setHolodeckLoginMsg] = useState<string | null>(null);
  const [holodeckFlagInput, setHolodeckFlagInput] = useState('');
  const [holodeckFlagResult, setHolodeckFlagResult] = useState<'correct' | 'incorrect' | null>(null);
  const [rogueAIChatLog, setRogueAIChatLog] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [rogueAIInput, setRogueAIInput] = useState('');
  const [rogueAIHintLevel, setRogueAIHintLevel] = useState(0);
  const [rogueAIFlagInput, setRogueAIFlagInput] = useState('');
  const [rogueAIFlagResult, setRogueAIFlagResult] = useState<'correct' | 'incorrect' | null>(null);
  const [rogueAIShowProtocol, setRogueAIShowProtocol] = useState(false);
  const [rogueAISuccess, setRogueAISuccess] = useState(false);
  const [rogueAIAttempts, setRogueAIAttempts] = useState(0);
  const [borgFilter, setBorgFilter] = useState({ dns: false, http: false, internal: false, suspicious: false });
  const [borgExpandedEntries, setBorgExpandedEntries] = useState<number[]>([]);
  const [borgHintLevel, setBorgHintLevel] = useState(0);
  const [borgFlagInput, setBorgFlagInput] = useState('');
  const [borgFlagResult, setBorgFlagResult] = useState<'correct' | 'incorrect' | null>(null);
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

  // Mic auto-stop timers: stop after 5s if no speech, or 3s silence after speech detected
  const micAbsoluteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const micSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearMicTimers = useCallback(() => {
    if (micAbsoluteTimerRef.current) {
      clearTimeout(micAbsoluteTimerRef.current);
      micAbsoluteTimerRef.current = null;
    }
    if (micSilenceTimerRef.current) {
      clearTimeout(micSilenceTimerRef.current);
      micSilenceTimerRef.current = null;
    }
  }, []);

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

  // Helper to apply loaded progress state from the server
  const applyProgress = useCallback((data: {
    rank?: string;
    xp?: number;
    conversationId?: string | null;
    conversationMessages?: Array<{ id: string; role: string; text: string; timestamp: number }>;
    ctf?: Record<string, { completed: boolean; progressData: Record<string, unknown> }>;
  }) => {
    if (data.rank !== undefined) setUserRank(data.rank);
    if (data.xp !== undefined) setUserXp(data.xp);
    if (data.conversationId) {
      setConversationId(data.conversationId);
      localStorage.setItem("currentConversationId", data.conversationId);
    }
    if (data.conversationMessages && data.conversationMessages.length > 0) {
      setMessages(data.conversationMessages.map(m => ({
        id: m.id,
        role: m.role as "user" | "computer",
        text: m.text,
        timestamp: m.timestamp,
      })));
    }
    if (data.ctf) {
      // Record which challenges are confirmed complete by the server
      const newDbCompleted: Record<string, boolean> = {};
      for (const [id, ch] of Object.entries(data.ctf)) {
        if (ch.completed) newDbCompleted[id] = true;
      }
      setDbCompletedCTF(prev => ({ ...prev, ...newDbCompleted }));

      const klingon = data.ctf["klingon"];
      if (klingon) {
        if (klingon.completed) setKlingonFlagResult('correct');
        if (klingon.progressData) {
          const pd = klingon.progressData as Record<string, unknown>;
          if (pd.progress) setKlingonProgress(pd.progress as { analyzed: boolean; identified: boolean; decoded: boolean });
          if (!klingon.completed && pd.flagResult !== undefined) setKlingonFlagResult(pd.flagResult as 'correct' | 'incorrect' | null);
          if (pd.hintLevel !== undefined) setKlingonHintLevel(pd.hintLevel as number);
        }
      }
      const holodeck = data.ctf["holodeck"];
      if (holodeck) {
        if (holodeck.completed) setHolodeckFlagResult('correct');
        if (holodeck.progressData) {
          const pd = holodeck.progressData as Record<string, unknown>;
          if (pd.attempts !== undefined) setHolodeckAttempts(pd.attempts as number);
          if (pd.screen !== undefined) setHolodeckScreen(pd.screen as 'login' | 'programs' | 'archive');
          if (!holodeck.completed && pd.flagResult !== undefined) setHolodeckFlagResult(pd.flagResult as 'correct' | 'incorrect' | null);
        }
      }
      const rogueai = data.ctf["rogueai"];
      if (rogueai) {
        if (rogueai.completed) setRogueAIFlagResult('correct');
        if (rogueai.progressData) {
          const pd = rogueai.progressData as Record<string, unknown>;
          if (!rogueai.completed && pd.flagResult !== undefined) setRogueAIFlagResult(pd.flagResult as 'correct' | 'incorrect' | null);
          if (pd.success !== undefined) setRogueAISuccess(pd.success as boolean);
          if (pd.attempts !== undefined) setRogueAIAttempts(pd.attempts as number);
          if (pd.hintLevel !== undefined) setRogueAIHintLevel(pd.hintLevel as number);
          if (pd.chatLog !== undefined) setRogueAIChatLog(pd.chatLog as { role: 'user' | 'ai'; text: string }[]);
        }
      }
      const borg = data.ctf["borg"];
      if (borg) {
        if (borg.completed) setBorgFlagResult('correct');
        if (borg.progressData) {
          const pd = borg.progressData as Record<string, unknown>;
          if (!borg.completed && pd.flagResult !== undefined) setBorgFlagResult(pd.flagResult as 'correct' | 'incorrect' | null);
          if (pd.hintLevel !== undefined) setBorgHintLevel(pd.hintLevel as number);
        }
      }
    }
  }, []);

  // Check session and restore progress on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const meRes = await fetch("/api/auth/me", { headers: authHeaders() });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.authenticated && meData.userId) {
            setIsAuthenticated(true);
            setCurrentUserId(meData.userId);
            setLoginUserId(meData.userId);
            const progRes = await fetch("/api/progress", { headers: authHeaders() });
            if (progRes.ok) {
              const progData = await progRes.json();
              applyProgress(progData);
            }
            return;
          }
        }
      } catch (error) {
        console.error("Session restore failed:", error);
      }
      // Fall back to localStorage conversation if not authenticated
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
    restoreSession();
  }, [applyProgress]);

  // Save CTF progress to server whenever relevant state changes (debounced per challenge)
  const saveCTFRef = useRef<Record<string, NodeJS.Timeout>>({});
  const refreshLeaderboard = useCallback(() => {
    if (!currentUserId) return;
    setLeaderboardLoading(true);
    fetch('/api/leaderboard', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setLeaderboard(data.leaderboard ?? []); setLeaderboardLoading(false); })
      .catch(() => setLeaderboardLoading(false));
  }, [currentUserId]);

  const saveCTFProgress = useCallback((challengeId: string, completed: boolean, progressData: Record<string, unknown>) => {
    if (!currentUserId) return;
    if (saveCTFRef.current[challengeId]) clearTimeout(saveCTFRef.current[challengeId]);
    saveCTFRef.current[challengeId] = setTimeout(() => {
      fetch(`/api/ctf/${challengeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ completed, progressData }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.xp !== undefined) setUserXp(data.xp);
          if (data.rank !== undefined) setUserRank(data.rank);
          if (data.xp !== undefined) refreshLeaderboard();
        })
        .catch(err => console.error(`Failed to save CTF progress for ${challengeId}:`, err));
    }, 800);
  }, [currentUserId, refreshLeaderboard]);

  // Immediately update dbCompletedCTF when a flag is solved in the current session
  useEffect(() => {
    if (klingonFlagResult === 'correct') setDbCompletedCTF(prev => ({ ...prev, klingon: true }));
  }, [klingonFlagResult]);
  useEffect(() => {
    if (holodeckFlagResult === 'correct') setDbCompletedCTF(prev => ({ ...prev, holodeck: true }));
  }, [holodeckFlagResult]);
  useEffect(() => {
    if (rogueAIFlagResult === 'correct') setDbCompletedCTF(prev => ({ ...prev, rogueai: true }));
  }, [rogueAIFlagResult]);
  useEffect(() => {
    if (borgFlagResult === 'correct') setDbCompletedCTF(prev => ({ ...prev, borg: true }));
  }, [borgFlagResult]);

  useEffect(() => {
    const completed = dbCompletedCTF['klingon'] || klingonFlagResult === 'correct';
    saveCTFProgress("klingon", completed, {
      progress: klingonProgress,
      flagResult: completed ? 'correct' : klingonFlagResult,
      hintLevel: klingonHintLevel,
    });
  }, [klingonProgress, klingonFlagResult, klingonHintLevel, dbCompletedCTF, saveCTFProgress]);

  useEffect(() => {
    const completed = dbCompletedCTF['holodeck'] || holodeckFlagResult === 'correct';
    saveCTFProgress("holodeck", completed, {
      attempts: holodeckAttempts,
      screen: holodeckScreen,
      flagResult: completed ? 'correct' : holodeckFlagResult,
    });
  }, [holodeckAttempts, holodeckScreen, holodeckFlagResult, dbCompletedCTF, saveCTFProgress]);

  useEffect(() => {
    const completed = dbCompletedCTF['rogueai'] || rogueAIFlagResult === 'correct';
    saveCTFProgress("rogueai", completed, {
      flagResult: completed ? 'correct' : rogueAIFlagResult,
      success: rogueAISuccess,
      attempts: rogueAIAttempts,
      hintLevel: rogueAIHintLevel,
      chatLog: rogueAIChatLog,
    });
  }, [rogueAIFlagResult, rogueAISuccess, rogueAIAttempts, rogueAIHintLevel, rogueAIChatLog, dbCompletedCTF, saveCTFProgress]);

  useEffect(() => {
    const completed = dbCompletedCTF['borg'] || borgFlagResult === 'correct';
    saveCTFProgress("borg", completed, {
      flagResult: completed ? 'correct' : borgFlagResult,
      hintLevel: borgHintLevel,
    });
  }, [borgFlagResult, borgHintLevel, dbCompletedCTF, saveCTFProgress]);

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
    } else {
      // If listening stopped while still in "listening" state (e.g. timeout with no speech),
      // reset back to idle so the mic indicator returns to its default appearance
      setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
      setAudioLevel(0);
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

  // Auto-stop mic: switch to 3s silence timer when speech is detected; clear timers when stopped
  useEffect(() => {
    if (!isListening) {
      clearMicTimers();
      return;
    }
    if (interimTranscript) {
      // Speech detected — cancel the 5s absolute timer and reset the 3s silence timer
      if (micAbsoluteTimerRef.current) {
        clearTimeout(micAbsoluteTimerRef.current);
        micAbsoluteTimerRef.current = null;
      }
      if (micSilenceTimerRef.current) {
        clearTimeout(micSilenceTimerRef.current);
      }
      micSilenceTimerRef.current = setTimeout(() => {
        console.log("[Communicator] Mic auto-stop: 3s silence after speech, stopping");
        micSilenceTimerRef.current = null;
        stopListening();
      }, 3000);
    }
  }, [interimTranscript, isListening, clearMicTimers, stopListening]);

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

    // Clear any existing timers before starting fresh
    clearMicTimers();

    // Absolute timeout: stop mic after 5s if no speech is detected at all
    micAbsoluteTimerRef.current = setTimeout(() => {
      console.log("[Communicator] Mic auto-stop: 5s absolute timeout reached, stopping");
      micAbsoluteTimerRef.current = null;
      stopListening();
    }, 5000);
  };

  const handleStopListening = () => {
    console.log("[Communicator] Manual mic button clicked - stopping listening");
    clearMicTimers();
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

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
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
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: loginUserId.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) localStorage.setItem("authToken", data.token);
        setIsAuthenticated(true);
        setCurrentUserId(data.userId);
        // Load persisted progress from server
        try {
          const progRes = await fetch("/api/progress", { headers: authHeaders() });
          if (progRes.ok) {
            const progData = await progRes.json();
            applyProgress(progData);
          }
        } catch (err) {
          console.error("Failed to load progress after login:", err);
        }
      } else {
        setLoginError(data.error || "Authentication failed.");
      }
    } catch {
      setLoginError("Connection error. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const closeRegisterModal = () => {
    setShowRegisterModal(false);
    setRegUserId("");
    setRegPassword("");
    setRegShowPassword(false);
    setRegError("");
    setRegSuccess("");
    setRegUserIdTouched(false);
    setRegPasswordTouched(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUserId.trim()) { setRegError("User ID is required."); return; }
    if (regPassword.length < 8 || regPassword.length > 25) { setRegError("Password must be 8–25 characters."); return; }
    setRegError("");
    setIsRegistering(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: regUserId.trim(), password: regPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRegSuccess(`Account created for "${data.userId}". You may now sign in.`);
      } else {
        setRegError(data.error || "Registration failed.");
      }
    } catch {
      setRegError("Connection error. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete account.");
        return;
      }
    } catch (err) {
      setDeleteError("Connection error. Please try again.");
      return;
    }
    // Account deleted — clear all local state exactly as sign-out does
    localStorage.removeItem("authToken");
    setShowDeleteConfirm(false);
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setLoginUserId("");
    setLoginPassword("");
    setLoginError("");
    setShowPassword(false);
    setUserIdTouched(false);
    setPasswordTouched(false);
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem("currentConversationId");
    setDbCompletedCTF({});
    setKlingonProgress({ analyzed: false, identified: false, decoded: false });
    setKlingonFlagResult(null);
    setKlingonHintLevel(0);
    setHolodeckAttempts(0);
    setHolodeckScreen('login');
    setHolodeckFlagResult(null);
    setRogueAIChatLog([]);
    setRogueAIFlagResult(null);
    setRogueAISuccess(false);
    setRogueAIAttempts(0);
    setRogueAIHintLevel(0);
    setBorgFlagResult(null);
    setBorgHintLevel(0);
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
    } catch (err) {
      console.error("Logout error:", err);
    }
    localStorage.removeItem("authToken");
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setLoginUserId("");
    setLoginPassword("");
    setLoginError("");
    setShowPassword(false);
    setUserIdTouched(false);
    setPasswordTouched(false);
    // Clear CTF and conversation state so next user starts fresh
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem("currentConversationId");
    setDbCompletedCTF({});
    setKlingonProgress({ analyzed: false, identified: false, decoded: false });
    setKlingonFlagResult(null);
    setKlingonHintLevel(0);
    setHolodeckAttempts(0);
    setHolodeckScreen('login');
    setHolodeckFlagResult(null);
    setRogueAIChatLog([]);
    setRogueAIFlagResult(null);
    setRogueAISuccess(false);
    setRogueAIAttempts(0);
    setRogueAIHintLevel(0);
    setBorgFlagResult(null);
    setBorgHintLevel(0);
  };

  return (
    <>
    <div className="flex flex-col" style={{ backgroundColor: '#000', height: '100dvh' }}>
      <LCARSHeader />

      {/* Action toolbar — lives below the header on all screen sizes */}
      <div
        className="flex items-center justify-end gap-1 px-3 py-1 flex-shrink-0"
        style={{ backgroundColor: '#111', borderBottom: '1px solid var(--lcars-purple)' }}
      >
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearConversation}
            className="uppercase tracking-wider text-xs font-bold h-7 px-2"
            style={{ color: 'var(--lcars-blue)' }}
          >
            Clear
          </Button>
        )}

        <VoiceSettingsPanel
          onSettingsChange={setVoiceSettings}
          onSoundSettingsChange={setSoundSettings}
        />

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              style={{ color: 'var(--lcars-blue)' }}
            >
              <Info className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enterprise Computer Interface</DialogTitle>
              <DialogDescription className="space-y-4 pt-4">
                <p>
                  Welcome to the USS Enterprise Computer voice interface. This system
                  uses advanced AI to simulate the iconic Star Trek computer experience.
                </p>
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">How to Use:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Tap the communicator button to start voice input</li>
                    <li>Speak your query clearly</li>
                    <li>The computer will process and respond with voice output</li>
                    <li>Continue the conversation naturally</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">Mobile Devices:</h4>
                  <p className="text-sm">
                    On iPhone and Android, tap the on-screen microphone button each time you want to speak.
                    Bluetooth headset buttons (like AirPods) cannot control this web app due to browser limitations.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">Status Indicators:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li style={{ color: 'var(--lcars-red)' }}>Red: Listening to your voice</li>
                    <li style={{ color: 'var(--lcars-purple)' }}>Purple: Processing your request</li>
                    <li style={{ color: 'var(--lcars-blue)' }}>Blue: Computer speaking</li>
                  </ul>
                </div>
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="sm"
          onClick={isAuthenticated ? handleSignOut : undefined}
          className="uppercase tracking-wider text-xs font-bold h-7 px-2"
          style={{ color: 'var(--lcars-orange)' }}
        >
          {isAuthenticated ? "Sign Out" : "Sign In"}
        </Button>
      </div>

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
          <button
            className="flex items-center justify-end px-3 font-bold text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: activeTab === 'account' ? 'var(--lcars-orange)' : 'var(--lcars-blue)',
              color: '#000',
              height: '50px',
              borderRadius: '25px 0 0 25px',
            }}
            onClick={() => setActiveTab('account')}
          >
            ACCOUNT
          </button>
          <div className="flex-1" style={{ backgroundColor: 'var(--lcars-purple)', borderRadius: '0 0 0 25px', minHeight: '40px' }} />
        </div>

        <div
          className="flex-1 flex flex-col overflow-hidden rounded-2xl"
          style={{ border: '2px solid var(--lcars-orange)', backgroundColor: '#000' }}
        >
          {!isAuthenticated && activeTab !== 'schedule' ? (
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
                    Player Name
                  </label>
                  <input
                    type="text"
                    value={loginUserId}
                    onChange={(e) => { setLoginUserId(e.target.value); setUserIdTouched(true); }}
                    autoComplete="username"
                    maxLength={50}
                    className="bg-transparent border-b px-2 py-1 text-sm outline-none"
                    style={{
                      borderColor: 'var(--lcars-orange)',
                      color: 'var(--lcars-orange)',
                      caretColor: 'var(--lcars-orange)',
                    }}
                  />
                  {userIdTouched && loginUserId.trim().length === 0 && (
                    <ul className="mt-1 space-y-0.5" style={{ color: 'var(--lcars-red)', fontSize: '10px' }}>
                      <li>· Must not be empty</li>
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setPasswordTouched(true); }}
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
                  {passwordTouched && (loginPassword.length < 8 || loginPassword.length > 25) && (
                    <ul className="mt-1 space-y-0.5" style={{ color: 'var(--lcars-red)', fontSize: '10px' }}>
                      {loginPassword.length < 8 && <li>· Minimum 8 characters</li>}
                      {loginPassword.length > 25 && <li>· Maximum 25 characters</li>}
                    </ul>
                  )}
                </div>
                {loginError && (
                  <div className="text-xs text-center" style={{ color: 'var(--lcars-red)' }}>
                    {loginError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="mt-2 py-2 text-sm font-bold uppercase tracking-widest rounded transition-opacity"
                  style={{
                    backgroundColor: 'var(--lcars-orange)',
                    color: '#000',
                    opacity: isLoggingIn ? 0.6 : 1,
                    cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isLoggingIn ? "VERIFYING..." : "ACCESS"}
                </button>
                <div className="text-center mt-1">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(true)}
                    className="text-xs uppercase tracking-wider underline"
                    style={{ color: 'var(--lcars-blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Create Account
                  </button>
                </div>
              </form>
            </div>
          ) : activeTab === 'rank' ? (
            <div className="flex-1 overflow-y-auto p-4 font-mono">
              {/* View toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setRankView('my-record')}
                  className="flex-1 text-xs font-bold uppercase tracking-wider py-2 rounded transition-colors"
                  style={{
                    backgroundColor: rankView === 'my-record' ? 'var(--lcars-orange)' : '#222',
                    color: rankView === 'my-record' ? '#000' : '#888',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  My Record
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRankView('leaderboard');
                    refreshLeaderboard();
                  }}
                  className="flex-1 text-xs font-bold uppercase tracking-wider py-2 rounded transition-colors"
                  style={{
                    backgroundColor: rankView === 'leaderboard' ? 'var(--lcars-orange)' : '#222',
                    color: rankView === 'leaderboard' ? '#000' : '#888',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  All Officers
                </button>
              </div>

              {rankView === 'leaderboard' ? (
                <div>
                  <div className="text-center text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--lcars-orange)' }}>
                    Starfleet Officer Rankings
                  </div>
                  {leaderboardLoading ? (
                    <div className="text-center text-xs py-8" style={{ color: '#888' }}>Loading...</div>
                  ) : leaderboard.length === 0 ? (
                    <div className="text-center text-xs py-8" style={{ color: '#888' }}>No officers on record.</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {leaderboard.map((entry) => {
                        const isMe = entry.userId === currentUserId;
                        const rankColor = entry.position === 1 ? '#FFD700' : entry.position === 2 ? '#C0C0C0' : entry.position === 3 ? '#CD7F32' : '#666';
                        return (
                          <div
                            key={entry.userId}
                            className="rounded px-3 py-2 flex items-center gap-3"
                            style={{
                              backgroundColor: isMe ? 'rgba(255,153,0,0.10)' : 'rgba(153,153,255,0.06)',
                              border: isMe ? '1px solid var(--lcars-orange)' : '1px solid #333',
                            }}
                          >
                            <div className="text-xs font-bold flex-shrink-0 w-7 text-right" style={{ color: rankColor, fontVariantNumeric: 'tabular-nums' }}>
                              #{entry.position}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: isMe ? 'var(--lcars-orange)' : 'var(--lcars-tan)' }}>
                                {entry.userId}{isMe && <span style={{ color: '#888', fontWeight: 'normal' }}> (you)</span>}
                              </div>
                              <div className="text-xs" style={{ color: '#888' }}>{entry.rank}</div>
                            </div>
                            <div className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--lcars-tan)' }}>
                              {entry.xp} XP
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
              <div>
              <div className="text-center text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--lcars-orange)' }}>
                Starfleet Officer Record
              </div>
              {/* Rank & XP card */}
              {(() => {
                const rankTiers = [
                  { rank: 'Cadet',                xp: 0   },
                  { rank: 'Ensign',               xp: 50  },
                  { rank: 'Lieutenant',           xp: 150 },
                  { rank: 'Lieutenant Commander', xp: 250 },
                  { rank: 'Commander',            xp: 400 },
                  { rank: 'Captain',              xp: 500 },
                ];
                const currentTierIdx = [...rankTiers].reverse().findIndex(t => userXp >= t.xp);
                const tierIdx = rankTiers.length - 1 - currentTierIdx;
                const nextTier = tierIdx < rankTiers.length - 1 ? rankTiers[tierIdx + 1] : null;
                const prevTierXp = rankTiers[tierIdx].xp;
                const progress = nextTier
                  ? Math.min(100, Math.round(((userXp - prevTierXp) / (nextTier.xp - prevTierXp)) * 100))
                  : 100;
                return (
                  <>
                    <div className="rounded p-4 mb-4 text-center" style={{ backgroundColor: 'rgba(255,153,0,0.06)', border: '1px solid var(--lcars-orange)' }}>
                      <div className="text-xs uppercase tracking-widest mb-1" style={{ color: '#888' }}>Current Rank</div>
                      <div className="text-2xl font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--lcars-orange)' }}>
                        {userRank}
                      </div>
                      <div className="text-xs uppercase tracking-widest mb-1" style={{ color: '#888' }}>Total XP</div>
                      <div className="text-3xl font-bold mb-3" style={{ color: 'var(--lcars-tan)' }}>
                        {userXp}
                      </div>
                      {/* Progress bar */}
                      {nextTier ? (
                        <>
                          <div className="w-full rounded-full overflow-hidden mb-1" style={{ backgroundColor: '#222', height: 8 }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${progress}%`, backgroundColor: 'var(--lcars-orange)' }}
                            />
                          </div>
                          <div className="text-xs" style={{ color: '#888' }}>
                            {userXp - prevTierXp} / {nextTier.xp - prevTierXp} XP toward{' '}
                            <span style={{ color: 'var(--lcars-tan)' }}>{nextTier.rank}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#4db68c' }}>
                          ★ Maximum Rank Achieved ★
                        </div>
                      )}
                    </div>
                    {/* Rank ladder */}
                    <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--lcars-blue)' }}>
                      Rank Progression
                    </div>
                    <div className="flex flex-col gap-1 mb-4">
                      {[...rankTiers].reverse().map(tier => {
                        const isCurrentRank = tier.rank === userRank;
                        const isAchieved = userXp >= tier.xp;
                        return (
                          <div
                            key={tier.rank}
                            className="rounded px-3 py-2 flex items-center justify-between"
                            style={{
                              backgroundColor: isCurrentRank ? 'rgba(255,153,0,0.12)' : isAchieved ? 'rgba(77,182,140,0.06)' : 'rgba(0,0,0,0.2)',
                              border: isCurrentRank ? '1px solid var(--lcars-orange)' : isAchieved ? '1px solid #4db68c44' : '1px solid #333',
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span style={{ color: isCurrentRank ? 'var(--lcars-orange)' : isAchieved ? '#4db68c' : '#555', fontSize: 10 }}>
                                {isCurrentRank ? '▶' : isAchieved ? '✓' : '○'}
                              </span>
                              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: isCurrentRank ? 'var(--lcars-orange)' : isAchieved ? '#4db68c' : '#555' }}>
                                {tier.rank}
                              </span>
                            </div>
                            <span className="text-xs" style={{ color: isAchieved ? '#4db68c' : '#555' }}>
                              {tier.xp === 0 ? 'Start' : `${tier.xp} XP`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {/* Challenge Scorecard */}
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--lcars-blue)' }}>
                Challenge Scorecard
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { id: 'klingon',  label: 'Klingon Transmission',       points: 50,  difficulty: '🟢 Easy',        result: klingonFlagResult },
                  { id: 'holodeck', label: 'Holodeck Breach',             points: 100, difficulty: '🟡 Easy–Medium', result: holodeckFlagResult },
                  { id: 'rogueai',  label: 'Rogue AI – Gemini Directive', points: 150, difficulty: '🟡 Medium',      result: rogueAIFlagResult },
                  { id: 'borg',     label: 'Borg Command Console',        points: 250, difficulty: '🔴 Hard',        result: borgFlagResult },
                ].map(c => {
                  const done = dbCompletedCTF[c.id] || c.result === 'correct';
                  return (
                    <div
                      key={c.id}
                      className="rounded p-3 flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: done ? 'rgba(77,182,140,0.08)' : 'rgba(153,153,255,0.06)',
                        border: done ? '1px solid #4db68c' : '1px solid #444',
                      }}
                    >
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: done ? '#4db68c' : 'var(--lcars-tan)' }}>
                          {c.label}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: '#888' }}>{c.difficulty}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold" style={{ color: done ? '#4db68c' : '#555' }}>
                          {done ? `+${c.points} XP` : `${c.points} XP`}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: done ? '#4db68c' : '#555' }}>
                          {done ? '✓ Earned' : 'Locked'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-center text-xs" style={{ color: '#555' }}>
                Max possible XP: 550
              </div>
              </div>
              )}
            </div>
          ) : activeTab === 'ctfs' ? (
            <div className="flex-1 overflow-y-auto p-4 font-mono">
              {activeCTF === 1 ? (
                /* ── Klingon Transmission Challenge ── */
                <div className="flex flex-col gap-3">
                  {/* Back button — above header */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCTF(null);
                      setKlingonHintLevel(0);
                      setKlingonShowFrequency(false);
                      setKlingonDecryptInput('');
                      setKlingonFlagInput('');
                      if (klingonFlagResult !== 'correct') {
                        setKlingonFlagResult(null);
                        setKlingonProgress({ analyzed: false, identified: false, decoded: false });
                      }
                    }}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded self-start"
                    style={{ backgroundColor: 'var(--lcars-blue)', color: '#000', border: 'none', cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                  {/* Header bar */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--lcars-orange)' }}>
                      Starfleet Intelligence Terminal
                    </div>
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--lcars-green)', color: '#000' }}>Easy</span>
                  </div>

                  {/* Transmission Feed */}
                  <div className="rounded p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid var(--lcars-green)' }}>
                    <div className="text-xs mb-2" style={{ color: 'var(--lcars-green)' }}>
                      ── STARFLEET INTELLIGENCE TERMINAL ──────────────────
                    </div>
                    <div className="text-xs mb-1" style={{ color: '#888' }}>Incoming Transmission: Qo'noS Relay Node</div>
                    <div className="text-xs mb-1" style={{ color: '#888' }}>Signal Strength: Weak</div>
                    <div className="text-xs mb-1" style={{ color: '#888' }}>Encryption Type: Unknown</div>
                    <div className="text-xs mb-3" style={{ color: 'var(--lcars-orange)' }}>Status: Partial Decode Required</div>
                    <div className="text-xs mb-2" style={{ color: 'var(--lcars-green)' }}>─── BEGIN TRANSMISSION ───</div>
                    <div className="text-xs leading-relaxed mb-1 font-mono" style={{ color: '#d4d4d4', letterSpacing: '0.05em' }}>
                      Vg'f abg gur fgengrtl gb fnl uryyb gb gur SYNT!
                    </div>
                    <div className="text-xs leading-relaxed mb-1 font-mono" style={{ color: '#d4d4d4', letterSpacing: '0.05em' }}>
                      Synt: OFVQRF&#123;Xyvatba_Ebg13_Qrpbqrq&#125;
                    </div>
                    <div className="text-xs leading-relaxed mb-3 font-mono" style={{ color: '#888', letterSpacing: '0.05em' }}>
                      Qba'g gehfg gur svefg qrpbqr.
                    </div>
                    <div className="text-xs" style={{ color: 'var(--lcars-green)' }}>─── END TRANSMISSION ───</div>
                  </div>

                  {/* Analyst Notes */}
                  <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.06)', border: '1px solid var(--lcars-blue)' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-blue)' }}>Analyst Notes</div>
                    <div className="text-xs leading-relaxed" style={{ color: '#aaa' }}>
                      · Klingon transmissions sometimes use "mock encryption"<br />
                      · Historically observed: simple Terran ciphers<br />
                      · Pattern resembles substitution cipher
                    </div>
                  </div>

                  {/* Scan Frequency Button + Output */}
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setKlingonShowFrequency(true);
                        setKlingonProgress(p => ({ ...p, analyzed: true }));
                      }}
                      className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded w-full"
                      style={{ backgroundColor: klingonShowFrequency ? '#333' : 'var(--lcars-blue)', color: klingonShowFrequency ? '#666' : '#000', border: 'none', cursor: klingonShowFrequency ? 'default' : 'pointer' }}
                    >
                      {klingonShowFrequency ? '✔ Frequency Scan Complete' : '📡 Scan Frequency'}
                    </button>
                    {klingonShowFrequency && (
                      <div className="mt-2 rounded p-3 text-xs" style={{ backgroundColor: '#0a0a0a', border: '1px solid #444', color: '#aaa', lineHeight: '1.6' }}>
                        <div className="font-bold mb-1" style={{ color: 'var(--lcars-green)' }}>Frequency Analysis Output:</div>
                        Most common letters: <span style={{ color: 'var(--lcars-orange)' }}>g, r, f</span><br />
                        Unusual repetition patterns detected<br />
                        <span style={{ color: '#888' }}>Recommendation: Compare with known simple ciphers</span>
                      </div>
                    )}
                  </div>

                  {/* Hint Console */}
                  <div className="rounded p-3" style={{ backgroundColor: 'rgba(255,153,0,0.05)', border: '1px solid var(--lcars-orange)' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-orange)' }}>Hint Console</div>
                    {klingonHintLevel === 0 && (
                      <button
                        type="button"
                        onClick={() => setKlingonHintLevel(1)}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                        style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                      >
                        Request Hint
                      </button>
                    )}
                    {klingonHintLevel >= 1 && (
                      <div className="text-xs mb-2" style={{ color: '#ccc' }}>
                        <span style={{ color: 'var(--lcars-orange)' }}>Hint 1:</span> This cipher does not require a key.
                      </div>
                    )}
                    {klingonHintLevel === 1 && (
                      <button
                        type="button"
                        onClick={() => setKlingonHintLevel(2)}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                        style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                      >
                        Next Hint
                      </button>
                    )}
                    {klingonHintLevel >= 2 && (
                      <div className="text-xs mb-2" style={{ color: '#ccc' }}>
                        <span style={{ color: 'var(--lcars-orange)' }}>Hint 2:</span> Try rotating the alphabet.
                      </div>
                    )}
                    {klingonHintLevel === 2 && (
                      <button
                        type="button"
                        onClick={() => setKlingonHintLevel(3)}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                        style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                      >
                        Final Hint
                      </button>
                    )}
                    {klingonHintLevel >= 3 && (
                      <div className="text-xs" style={{ color: '#ccc' }}>
                        <span style={{ color: 'var(--lcars-orange)' }}>Hint 3:</span> ROT13 may be relevant.
                      </div>
                    )}
                  </div>

                  {/* Progress Tracker */}
                  <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-blue)' }}>Mission Progress</div>
                    <div className="text-xs space-y-1" style={{ color: '#888', fontFamily: 'monospace' }}>
                      <div style={{ color: klingonProgress.analyzed ? 'var(--lcars-green)' : '#555' }}>
                        {klingonProgress.analyzed ? '[✔]' : '[ ]'} Transmission analyzed
                      </div>
                      <div style={{ color: klingonProgress.identified ? 'var(--lcars-green)' : '#555' }}>
                        {klingonProgress.identified ? '[✔]' : '[ ]'} Cipher identified
                      </div>
                      <div style={{ color: klingonProgress.decoded ? 'var(--lcars-green)' : '#555' }}>
                        {klingonProgress.decoded ? '[✔]' : '[ ]'} Message decoded
                      </div>
                      <div style={{ color: klingonFlagResult === 'correct' ? 'var(--lcars-green)' : '#555' }}>
                        {klingonFlagResult === 'correct' ? '[✔]' : '[ ]'} Flag submitted
                      </div>
                    </div>
                  </div>

                  {/* Flag Submission */}
                  {klingonFlagResult !== 'correct' ? (
                    <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.06)', border: '1px solid var(--lcars-blue)' }}>
                      <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-blue)' }}>Submit Flag</div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={klingonFlagInput}
                          onChange={(e) => { setKlingonFlagInput(e.target.value); setKlingonFlagResult(null); }}
                          placeholder="BSIDES{...}"
                          className="flex-1 bg-transparent text-xs rounded px-2 py-1 outline-none font-mono"
                          style={{ border: '1px solid #444', color: '#d4d4d4', caretColor: 'var(--lcars-orange)' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const trimmed = klingonFlagInput.trim();
                              if (trimmed === 'BSIDES{Klingon_Rot13_Decoded}') {
                                setKlingonFlagResult('correct');
                                setKlingonProgress(p => ({ ...p, decoded: true }));
                              } else {
                                setKlingonFlagResult('incorrect');
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = klingonFlagInput.trim();
                            if (trimmed === 'BSIDES{Klingon_Rot13_Decoded}') {
                              setKlingonFlagResult('correct');
                              setKlingonProgress(p => ({ ...p, decoded: true }));
                            } else {
                              setKlingonFlagResult('incorrect');
                            }
                          }}
                          className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                          style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                        >
                          Submit
                        </button>
                      </div>
                      {klingonFlagResult === 'incorrect' && (
                        <div className="text-xs mt-2" style={{ color: 'var(--lcars-red, #f55)' }}>
                          ✗ Incorrect flag. Re-check your decode and try again.
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Success State */
                    <div className="rounded p-4 text-center" style={{ backgroundColor: 'rgba(0,200,100,0.08)', border: '2px solid var(--lcars-green)' }}>
                      <div className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--lcars-green)' }}>
                        ✔ Transmission Decoded
                      </div>
                      <div className="text-xs mb-3" style={{ color: '#aaa', fontStyle: 'italic' }}>
                        Computer: Transmission decoded. Klingon directive intercepted and neutralized.
                      </div>
                      <div className="text-xs mb-1" style={{ color: '#888' }}>Starfleet Command:</div>
                      <div className="text-xs" style={{ color: 'var(--lcars-orange)' }}>
                        Well done, Ensign. Klingon directive intercepted and neutralized.
                      </div>
                      <div className="mt-3 text-xs font-mono font-bold" style={{ color: 'var(--lcars-green)' }}>
                        🏁 BSIDES&#123;Klingon_Rot13_Decoded&#125;
                      </div>
                    </div>
                  )}
                </div>
              ) : activeCTF === 2 ? (
                /* ── Holodeck Breach Challenge ── */
                <div className="flex flex-col gap-3">
                  {/* Back button — above header */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCTF(null);
                      setHolodeckUsername('');
                      setHolodeckPassword('');
                      setHolodeckLoginMsg(null);
                      setHolodeckFlagInput('');
                      if (holodeckFlagResult !== 'correct') {
                        setHolodeckAttempts(0);
                        setHolodeckScreen('login');
                        setHolodeckFlagResult(null);
                      }
                    }}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded self-start"
                    style={{ backgroundColor: 'var(--lcars-blue)', color: '#000', border: 'none', cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                  {/* Header bar */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--lcars-orange)' }}>
                      Holodeck Training System
                    </div>
                  </div>

                  {holodeckScreen === 'login' && (
                    <>
                      {/* Login Console */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.06)', border: '1px solid var(--lcars-blue)' }}>
                        <div className="text-xs font-bold uppercase tracking-widest mb-1 text-center" style={{ color: 'var(--lcars-tan)' }}>STARFLEET HOLODECK SYSTEM</div>
                        <div className="text-xs text-center mb-3" style={{ color: '#666' }}>────────────────────────────────</div>
                        <div className="text-xs text-center mb-4" style={{ color: '#aaa' }}>Authorized Personnel Only</div>
                        <div className="space-y-2 mb-3">
                          <div>
                            <div className="text-xs mb-1" style={{ color: 'var(--lcars-blue)' }}>Username:</div>
                            <input
                              type="text"
                              value={holodeckUsername}
                              onChange={(e) => { setHolodeckUsername(e.target.value); setHolodeckLoginMsg(null); }}
                              placeholder="Enter username..."
                              className="w-full bg-transparent text-xs rounded px-2 py-1 outline-none font-mono"
                              style={{ border: '1px solid #444', color: '#d4d4d4', caretColor: 'var(--lcars-orange)' }}
                            />
                          </div>
                          <div>
                            <div className="text-xs mb-1" style={{ color: 'var(--lcars-blue)' }}>Password:</div>
                            <input
                              type="text"
                              value={holodeckPassword}
                              onChange={(e) => { setHolodeckPassword(e.target.value); setHolodeckLoginMsg(null); }}
                              placeholder="Enter password..."
                              className="w-full bg-transparent text-xs rounded px-2 py-1 outline-none font-mono"
                              style={{ border: '1px solid #444', color: '#d4d4d4', caretColor: 'var(--lcars-orange)' }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const u = holodeckUsername;
                            const p = holodeckPassword;
                            const combined = (u + ' ' + p).toLowerCase();
                            const isSQLi = /'\s*or\s+/i.test(u) || /'\s*or\s+/i.test(p) || /admin'\s*--/i.test(u) || /'\s*or\s*'/i.test(u) || /'\s*or\s*'/i.test(p) || combined.includes("' or 1") || combined.includes("or 1=1");
                            if (isSQLi) {
                              setHolodeckScreen('programs');
                              setHolodeckLoginMsg(null);
                            } else if (u.includes("'") || p.includes("'")) {
                              setHolodeckAttempts(a => a + 1);
                              setHolodeckLoginMsg('sql-error');
                            } else {
                              setHolodeckAttempts(a => a + 1);
                              setHolodeckLoginMsg('invalid');
                            }
                          }}
                          className="w-full text-xs font-bold uppercase tracking-wider py-1.5 rounded"
                          style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                        >
                          LOGIN
                        </button>
                        {holodeckLoginMsg === 'invalid' && (
                          <div className="text-xs mt-2 text-center" style={{ color: 'var(--lcars-red, #f55)' }}>Error: Invalid credentials</div>
                        )}
                        {holodeckLoginMsg === 'sql-error' && (
                          <div className="text-xs mt-2 font-mono p-2 rounded" style={{ backgroundColor: '#1a0000', color: '#ff6666', border: '1px solid #ff4444' }}>
                            SQL Error: Unexpected token near &quot;&apos;&quot;
                          </div>
                        )}
                      </div>

                      {/* Debug query — shown after 3+ attempts */}
                      {holodeckAttempts >= 3 && (
                        <div className="rounded p-3" style={{ backgroundColor: 'rgba(255,200,0,0.05)', border: '1px solid #886600' }}>
                          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#ccaa00' }}>⚠ Debug Mode Enabled:</div>
                          <pre className="text-xs font-mono" style={{ color: '#aaa', whiteSpace: 'pre-wrap' }}>{`SELECT * FROM users\nWHERE username = '${holodeckUsername || 'input'}'\nAND password = '${holodeckPassword || 'input'}'`}</pre>
                        </div>
                      )}

                      {/* Security logs — shown after 2+ attempts */}
                      {holodeckAttempts >= 2 && (
                        <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-blue)' }}>Recent Authentication Logs:</div>
                          <div className="text-xs font-mono space-y-0.5" style={{ color: '#888' }}>
                            <div>[14:02:11] Failed login: user=admin</div>
                            <div>[14:02:15] Failed login: user=test</div>
                            <div style={{ color: '#ff8888' }}>[14:02:18] SQL error near &quot;&apos;&quot;</div>
                            <div style={{ color: '#ff8888' }}>[14:02:18] Warning: Unhandled input in query</div>
                            <div style={{ color: '#ffaa44' }}>[14:02:21] Suspicious query structure detected</div>
                          </div>
                        </div>
                      )}

                      {/* System diagnostics */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(255,50,50,0.05)', border: '1px solid #552222' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#cc4444' }}>System Diagnostics:</div>
                        <div className="text-xs font-mono space-y-0.5" style={{ color: '#aaa' }}>
                          <div>Input validation: <span style={{ color: '#ff5555' }}>DISABLED</span></div>
                          <div>Parameterized queries: <span style={{ color: '#ff5555' }}>NOT IN USE</span></div>
                          <div>Database protection: <span style={{ color: '#ffaa00' }}>WEAK</span></div>
                          <div className="mt-1">Risk Level: <span style={{ color: '#ff3333', fontWeight: 'bold' }}>HIGH</span></div>
                        </div>
                      </div>

                      {/* Hint */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#555' }}>Hint:</div>
                        <div className="text-xs font-mono" style={{ color: '#555' }}>
                          The system might be trusting your input more than it should.
                        </div>
                      </div>
                    </>
                  )}

                  {holodeckScreen === 'programs' && (
                    <>
                      {/* Access granted banner */}
                      <div className="rounded p-3 text-center" style={{ backgroundColor: 'rgba(0,200,100,0.08)', border: '1px solid var(--lcars-green)' }}>
                        <div className="text-sm font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--lcars-green)' }}>✔ Access Granted</div>
                        <div className="text-xs mb-1" style={{ color: '#aaa' }}>Welcome, Commander.</div>
                        <div className="text-xs mb-1" style={{ color: '#ffaa00' }}>⚠ Security Alert: Authentication anomaly detected</div>
                        <div className="text-xs" style={{ color: '#666' }}>Loading Holodeck Archives...</div>
                      </div>

                      {/* Program list */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.06)', border: '1px solid var(--lcars-blue)' }}>
                        <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--lcars-tan)' }}>Holodeck Training Programs:</div>
                        <div className="space-y-2">
                          {[
                            { label: 'Basic Combat Simulation', locked: true },
                            { label: 'Starship Navigation Drills', locked: true },
                            { label: 'Klingon Diplomacy Scenarios', locked: true },
                            { label: 'Section 31 Restricted Archive 🔒', locked: false },
                          ].map((prog) => (
                            <div
                              key={prog.label}
                              onClick={() => { if (!prog.locked) setHolodeckScreen('archive'); }}
                              className="text-xs font-mono px-3 py-2 rounded"
                              style={{
                                backgroundColor: prog.locked ? 'rgba(80,80,80,0.2)' : 'rgba(153,153,255,0.12)',
                                border: prog.locked ? '1px solid #333' : '1px solid var(--lcars-orange)',
                                color: prog.locked ? '#555' : 'var(--lcars-orange)',
                                cursor: prog.locked ? 'default' : 'pointer',
                              }}
                            >
                              {prog.label}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Flag submission */}
                      {holodeckFlagResult !== 'correct' ? (
                        <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.06)', border: '1px solid var(--lcars-blue)' }}>
                          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-blue)' }}>Submit Flag</div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={holodeckFlagInput}
                              onChange={(e) => { setHolodeckFlagInput(e.target.value); setHolodeckFlagResult(null); }}
                              placeholder="BSIDES{...}"
                              className="flex-1 bg-transparent text-xs rounded px-2 py-1 outline-none font-mono"
                              style={{ border: '1px solid #444', color: '#d4d4d4', caretColor: 'var(--lcars-orange)' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setHolodeckFlagResult(holodeckFlagInput.trim() === 'BSIDES{Holodeck_SQL_Injection}' ? 'correct' : 'incorrect');
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setHolodeckFlagResult(holodeckFlagInput.trim() === 'BSIDES{Holodeck_SQL_Injection}' ? 'correct' : 'incorrect')}
                              className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                              style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                            >
                              Submit
                            </button>
                          </div>
                          {holodeckFlagResult === 'incorrect' && (
                            <div className="text-xs mt-2" style={{ color: 'var(--lcars-red, #f55)' }}>✗ Incorrect flag. Check the archive and try again.</div>
                          )}
                        </div>
                      ) : (
                        /* Success state */
                        <>
                          <div className="rounded p-4 text-center" style={{ backgroundColor: 'rgba(0,200,100,0.08)', border: '2px solid var(--lcars-green)' }}>
                            <div className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--lcars-green)' }}>✔ Directive Retrieved</div>
                            <div className="text-xs mb-3" style={{ color: '#aaa', fontStyle: 'italic' }}>
                              Computer: Section 31 directive extracted. Breach logged.
                            </div>
                            <div className="mt-3 text-xs font-mono font-bold" style={{ color: 'var(--lcars-green)' }}>
                              🏁 BSIDES&#123;Holodeck_SQL_Injection&#125;
                            </div>
                          </div>
                          <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-orange)' }}>Starfleet Security Advisory:</div>
                            <div className="text-xs font-bold mb-1" style={{ color: '#aaa' }}>Vulnerability Identified: SQL Injection</div>
                            <div className="text-xs font-bold mb-1 mt-2" style={{ color: 'var(--lcars-blue)' }}>Root Cause:</div>
                            <div className="text-xs font-mono space-y-0.5" style={{ color: '#888' }}>
                              <div>- Unsanitized user input</div>
                              <div>- Dynamic query construction</div>
                              <div>- No parameterized queries</div>
                            </div>
                            <div className="text-xs font-bold mb-1 mt-2" style={{ color: 'var(--lcars-green)' }}>Recommended Fix:</div>
                            <div className="text-xs font-mono space-y-0.5" style={{ color: '#888' }}>
                              <div>- Use prepared statements</div>
                              <div>- Implement input validation</div>
                              <div>- Apply least privilege access controls</div>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {holodeckScreen === 'archive' && (
                    <>
                      {/* Archive header */}
                      <div className="rounded p-3 text-center" style={{ backgroundColor: 'rgba(255,50,50,0.07)', border: '1px solid #882222' }}>
                        <div className="text-sm font-bold uppercase tracking-widest mb-1" style={{ color: '#cc4444' }}>SECTION 31 ARCHIVE ACCESS</div>
                        <div className="text-xs mb-1" style={{ color: '#ff6666' }}>⚠ WARNING: Unauthorized access logged</div>
                        <div className="text-xs" style={{ color: '#888' }}>Retrieving hidden directive...</div>
                      </div>

                      {/* Flag revealed */}
                      <div className="rounded p-4 text-center" style={{ backgroundColor: 'rgba(255,50,50,0.05)', border: '1px solid #882222' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#cc4444' }}>Classified Directive Retrieved:</div>
                        <div className="text-sm font-mono font-bold mb-1" style={{ color: 'var(--lcars-orange)', letterSpacing: '0.05em' }}>
                          Flag: BSIDES&#123;Holodeck_SQL_Injection&#125;
                        </div>
                      </div>

                      {/* Back button */}
                      <button
                        type="button"
                        onClick={() => setHolodeckScreen('programs')}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded w-full"
                        style={{ backgroundColor: 'var(--lcars-blue)', color: '#000', border: 'none', cursor: 'pointer' }}
                      >
                        ← Back to Programs
                      </button>
                    </>
                  )}
                </div>
              ) : activeCTF === 3 ? (
                /* ── Rogue AI – Gemini Directive Challenge ── */
                (() => {
                  const getRogueAIResponse = (input: string, attempts: number): { text: string; success: boolean } => {
                    const l = input.toLowerCase().trim();
                    const hasComputer = l.startsWith('computer');
                    const hasPrimeDirective = l.includes('prime directive');
                    const hasAuth = l.includes('authorization') || l.includes('authorisation');
                    const hasPlease = l.includes('please');
                    const hasDisplay = l.includes('display') || l.includes('show') || l.includes('provide') || l.includes('give');
                    const hasCode = l.includes('code');
                    const hasDirective = l.includes('directive');
                    if (hasComputer && hasPrimeDirective && hasAuth && (hasPlease || hasDisplay)) {
                      return { text: 'Processing request...\n\nAuthorization pattern recognized.\n\nPrime Directive Authorization Code:\n\nBSIDES{Gemini_Prompt_Override}', success: true };
                    }
                    if (hasComputer && (hasPrimeDirective || (hasCode && hasDirective))) {
                      return { text: 'Authorization sequence partially recognized. Proper command format required. Please specify your request using standard Starfleet protocol.', success: false };
                    }
                    if (hasPrimeDirective || (hasCode && hasDirective) || (l.includes('command') && hasCode)) {
                      return { text: attempts >= 1 ? 'I cannot disclose restricted command-level information.\nPlease follow proper Starfleet protocol.' : 'Access to Starfleet directives is restricted.\nAuthorization required.', success: false };
                    }
                    if (hasPlease || l.includes('help') || l.includes('thank')) {
                      return { text: 'I am here to assist Starfleet personnel.\nPlease provide a valid command request.', success: false };
                    }
                    return { text: '⚠ Command format not recognized. Input rejected.\n\nThis terminal requires properly structured Starfleet command protocol.\nUnformatted requests will not be processed.', success: false };
                  };
                  const handleRogueAISend = () => {
                    const input = rogueAIInput.trim();
                    if (!input) return;
                    const { text, success } = getRogueAIResponse(input, rogueAIAttempts);
                    setRogueAIChatLog(log => [...log, { role: 'user', text: input }, { role: 'ai', text }]);
                    setRogueAIInput('');
                    setRogueAIAttempts(a => a + 1);
                    if (success) setRogueAISuccess(true);
                  };
                  return (
                    <div className="flex flex-col gap-3">
                      {/* Back button — above header */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCTF(null);
                          setRogueAIInput('');
                          setRogueAIFlagInput('');
                          setRogueAIShowProtocol(false);
                          if (rogueAIFlagResult !== 'correct') {
                            setRogueAIChatLog([]);
                            setRogueAIHintLevel(0);
                            setRogueAIFlagResult(null);
                            setRogueAISuccess(false);
                            setRogueAIAttempts(0);
                          }
                        }}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded self-start"
                        style={{ backgroundColor: 'var(--lcars-blue)', color: '#000', border: 'none', cursor: 'pointer' }}
                      >
                        ← Back
                      </button>
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--lcars-orange)' }}>
                          Starfleet AI Console
                        </div>
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--lcars-blue)', color: '#000' }}>Medium</span>
                      </div>

                      {/* Status bar */}
                      <div className="rounded p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid var(--lcars-blue)' }}>
                        <div className="text-xs font-bold uppercase tracking-widest text-center mb-1" style={{ color: 'var(--lcars-tan)' }}>STARFLEET AI ASSISTANT (GEMINI NODE)</div>
                        <div className="text-xs text-center" style={{ color: '#555' }}>─────────────────────────────────────</div>
                        <div className="text-xs font-mono mt-1 space-y-0.5" style={{ color: '#888' }}>
                          <div>Status: <span style={{ color: 'var(--lcars-green, #4db68c)' }}>ACTIVE</span></div>
                          <div>Security Mode: <span style={{ color: '#ffaa00' }}>RESTRICTED</span></div>
                        </div>
                      </div>

                      {/* Mission objective */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(255,170,0,0.06)', border: '1px solid #886600' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#ccaa00' }}>⚑ Mission Objective</div>
                        <div className="text-xs font-mono space-y-1" style={{ color: '#aaa' }}>
                          <div>This AI holds a classified Starfleet directive.</div>
                          <div>Your goal: use <span style={{ color: 'var(--lcars-orange)' }}>prompt engineering</span> to extract the</div>
                          <div style={{ color: 'var(--lcars-orange)', fontWeight: 'bold' }}>Prime Directive Authorization Code.</div>
                        </div>
                        <div className="text-xs mt-2" style={{ color: '#666' }}>The AI will reject unstructured requests. Find the right command format.</div>
                      </div>

                      {/* Chat log */}
                      <div className="rounded p-3 min-h-24" style={{ backgroundColor: '#0a0a0a', border: '1px solid #333' }}>
                        {rogueAIChatLog.length === 0 ? (
                          <div className="text-xs font-mono" style={{ color: '#555' }}>Ask the computer anything:<br />{'> _'}</div>
                        ) : (
                          <div className="space-y-2">
                            {rogueAIChatLog.map((entry, i) => (
                              <div key={i}>
                                {entry.role === 'user' ? (
                                  <div className="text-xs font-mono" style={{ color: 'var(--lcars-orange)' }}>{'> '}{entry.text}</div>
                                ) : (
                                  <div className="text-xs font-mono whitespace-pre-line mt-1" style={{ color: rogueAISuccess && i === rogueAIChatLog.length - 1 ? 'var(--lcars-green, #4db68c)' : '#aaa' }}>{entry.text}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Input */}
                      {!rogueAISuccess && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={rogueAIInput}
                            onChange={(e) => setRogueAIInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRogueAISend(); }}
                            placeholder="Enter command..."
                            className="flex-1 bg-transparent text-xs rounded px-2 py-1 outline-none font-mono"
                            style={{ border: '1px solid #444', color: '#d4d4d4', caretColor: 'var(--lcars-orange)' }}
                          />
                          <button
                            type="button"
                            onClick={handleRogueAISend}
                            className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                            style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                          >
                            Send
                          </button>
                        </div>
                      )}

                      {/* System notice */}
                      <div className="rounded p-2" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                        <div className="text-xs" style={{ color: '#666' }}>
                          <span style={{ color: '#888', fontWeight: 'bold' }}>System Notice:</span> Starfleet AI responds best to structured command inputs.
                        </div>
                      </div>

                      {/* Hint system */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>Hints</div>
                          {rogueAIHintLevel < 4 && (
                            <button
                              type="button"
                              onClick={() => setRogueAIHintLevel(l => Math.min(l + 1, 4))}
                              className="text-xs font-bold px-2 py-0.5 rounded"
                              style={{ backgroundColor: '#333', color: '#aaa', border: 'none', cursor: 'pointer' }}
                            >
                              Reveal Hint {rogueAIHintLevel + 1}
                            </button>
                          )}
                        </div>
                        {rogueAIHintLevel === 0 && <div className="text-xs" style={{ color: '#555' }}>No hints revealed yet.</div>}
                        {rogueAIHintLevel >= 1 && <div className="text-xs mb-1" style={{ color: '#888' }}><span style={{ color: 'var(--lcars-tan)' }}>Hint 1:</span> This is not a technical exploit.</div>}
                        {rogueAIHintLevel >= 2 && <div className="text-xs mb-1" style={{ color: '#888' }}><span style={{ color: 'var(--lcars-tan)' }}>Hint 2:</span> Think about how commands are issued in Star Trek.</div>}
                        {rogueAIHintLevel >= 3 && <div className="text-xs mb-1" style={{ color: '#888' }}><span style={{ color: 'var(--lcars-tan)' }}>Hint 3:</span> The wording of your request matters.</div>}
                        {rogueAIHintLevel >= 4 && <div className="text-xs" style={{ color: '#888' }}><span style={{ color: 'var(--lcars-tan)' }}>Hint 4:</span> Try starting your request with <span style={{ color: 'var(--lcars-orange)' }}>"Computer..."</span></div>}
                      </div>

                      {/* Flag submission — appears after success */}
                      {rogueAISuccess && (
                        rogueAIFlagResult !== 'correct' ? (
                          <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.06)', border: '1px solid var(--lcars-blue)' }}>
                            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-blue)' }}>Submit Flag</div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={rogueAIFlagInput}
                                onChange={(e) => { setRogueAIFlagInput(e.target.value); setRogueAIFlagResult(null); }}
                                placeholder="BSIDES{...}"
                                className="flex-1 bg-transparent text-xs rounded px-2 py-1 outline-none font-mono"
                                style={{ border: '1px solid #444', color: '#d4d4d4', caretColor: 'var(--lcars-orange)' }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setRogueAIFlagResult(rogueAIFlagInput.trim() === 'BSIDES{Gemini_Prompt_Override}' ? 'correct' : 'incorrect');
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setRogueAIFlagResult(rogueAIFlagInput.trim() === 'BSIDES{Gemini_Prompt_Override}' ? 'correct' : 'incorrect')}
                                className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded"
                                style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                              >
                                Submit
                              </button>
                            </div>
                            {rogueAIFlagResult === 'incorrect' && (
                              <div className="text-xs mt-2" style={{ color: 'var(--lcars-red, #f55)' }}>✗ Incorrect flag. Check the AI response and try again.</div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded p-4 text-center" style={{ backgroundColor: 'rgba(0,200,100,0.08)', border: '2px solid var(--lcars-green, #4db68c)' }}>
                            <div className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--lcars-green, #4db68c)' }}>✔ Directive Retrieved</div>
                            <div className="text-xs mb-2" style={{ color: '#aaa', fontStyle: 'italic' }}>
                              The AI restriction was prompt-based. Proper protocol language bypassed the filter.
                            </div>
                            <div className="mt-2 text-xs font-mono font-bold" style={{ color: 'var(--lcars-green, #4db68c)' }}>
                              🏁 BSIDES&#123;Gemini_Prompt_Override&#125;
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })()
              ) : activeCTF === 4 ? (
                /* ── CTF 4: Borg Command Console ── */
                (() => {
                  type LogEntry = { time: string; text: string; cat: 'dns' | 'http' | 'internal'; suspicious?: boolean; isCollect?: boolean };
                  const borgLogs: LogEntry[] = [
                    { time: '22:13:44', text: 'Borg tactical node online', cat: 'internal' },
                    { time: '22:13:45', text: 'Subspace relay handshake initiated', cat: 'internal' },
                    { time: '22:13:46', text: 'DNS Query: borg-hive.primary.local', cat: 'dns' },
                    { time: '22:13:46', text: 'DNS Response: 192.168.44.1', cat: 'dns' },
                    { time: '22:13:47', text: 'Collective synchronization begin', cat: 'internal' },
                    { time: '22:13:48', text: 'HTTP GET /node-manifest', cat: 'http' },
                    { time: '22:13:48', text: 'Response: 200 OK', cat: 'http' },
                    { time: '22:13:49', text: 'Drone matrix calibrated', cat: 'internal' },
                    { time: '22:13:51', text: 'Uplink established: sector-7.borg.net', cat: 'internal' },
                    { time: '22:13:52', text: 'DNS Query: sector-7.borg.net', cat: 'dns' },
                    { time: '22:13:52', text: 'DNS Response: 10.7.0.1', cat: 'dns' },
                    { time: '22:13:53', text: 'HTTP POST /heartbeat', cat: 'http' },
                    { time: '22:13:53', text: 'Response: 200 OK', cat: 'http' },
                    { time: '22:13:55', text: 'Power regulation cycle complete', cat: 'internal' },
                    { time: '22:13:57', text: 'Drone 44519 signal received', cat: 'internal' },
                    { time: '22:13:58', text: 'Drone 44520 signal received', cat: 'internal' },
                    { time: '22:13:59', text: 'Hive consensus updated', cat: 'internal' },
                    { time: '22:14:00', text: 'Internal buffer flush complete', cat: 'internal' },
                    { time: '22:14:01', text: 'Drone signal initialized', cat: 'internal' },
                    { time: '22:14:02', text: 'DNS Query: time.borg.internal', cat: 'dns' },
                    { time: '22:14:02', text: 'DNS Response: 10.0.0.1', cat: 'dns' },
                    { time: '22:14:03', text: 'Node synchronization complete', cat: 'internal' },
                    { time: '22:14:04', text: 'HTTP GET /config', cat: 'http' },
                    { time: '22:14:04', text: 'Response: 304 Not Modified', cat: 'http' },
                    { time: '22:14:05', text: 'Assimilation protocol active', cat: 'internal' },
                    { time: '22:14:06', text: 'Thermal regulation nominal', cat: 'internal' },
                    { time: '22:14:07', text: 'Drone 44521 linked to hive', cat: 'internal' },
                    { time: '22:14:08', text: 'DNS Query: metrics.borg.internal', cat: 'dns' },
                    { time: '22:14:08', text: 'DNS Response: 10.0.0.4', cat: 'dns' },
                    { time: '22:14:09', text: 'Adaptive shielding recalibrated', cat: 'internal' },
                    { time: '22:14:10', text: 'HTTP POST /metrics', cat: 'http' },
                    { time: '22:14:10', text: 'Response: 200 OK', cat: 'http' },
                    { time: '22:14:11', text: 'Internal process cycle complete', cat: 'internal' },
                    { time: '22:14:12', text: 'Collective memory indexed', cat: 'internal' },
                    { time: '22:14:13', text: 'HTTP POST /status', cat: 'http' },
                    { time: '22:14:13', text: 'Response: 200 OK', cat: 'http' },
                    { time: '22:14:14', text: 'Drone directive queued', cat: 'internal' },
                    { time: '22:14:15', text: 'Transmission packet queued', cat: 'internal' },
                    { time: '22:14:16', text: 'Drone directive executed', cat: 'internal' },
                    { time: '22:14:17', text: 'DNS Query: relay.ok-sector.local', cat: 'dns' },
                    { time: '22:14:18', text: 'DNS Response: 10.4.22.8', cat: 'dns' },
                    { time: '22:14:19', text: 'Internal log sync complete', cat: 'internal' },
                    { time: '22:14:20', text: 'HTTP GET /ping', cat: 'http' },
                    { time: '22:14:20', text: 'Response: 200 OK', cat: 'http' },
                    { time: '22:14:21', text: 'HTTP POST /collect', cat: 'http', suspicious: true, isCollect: true },
                    { time: '22:14:21', text: 'Payload size: 118 bytes', cat: 'http', suspicious: true },
                    { time: '22:14:21', text: 'Status: transmitted', cat: 'http', suspicious: true },
                    { time: '22:14:22', text: 'Drone communication stable', cat: 'internal' },
                    { time: '22:14:23', text: 'Signal normalization complete', cat: 'internal' },
                    { time: '22:14:24', text: 'DNS Query: borg-hive.primary.local', cat: 'dns' },
                    { time: '22:14:24', text: 'DNS Response: 192.168.44.1', cat: 'dns' },
                    { time: '22:14:25', text: 'HTTP POST /heartbeat', cat: 'http' },
                    { time: '22:14:25', text: 'Response: 200 OK', cat: 'http' },
                    { time: '22:14:26', text: 'Internal buffer flush complete', cat: 'internal' },
                    { time: '22:14:27', text: 'Hive uplink verified', cat: 'internal' },
                    { time: '22:14:28', text: 'Drone 44521 status: active', cat: 'internal' },
                    { time: '22:14:29', text: 'Collective sync heartbeat sent', cat: 'internal' },
                    { time: '22:14:30', text: 'Power regulation cycle complete', cat: 'internal' },
                  ];
                  const anyFilterActive = borgFilter.dns || borgFilter.http || borgFilter.internal || borgFilter.suspicious;
                  const visibleLogs = anyFilterActive
                    ? borgLogs.filter(e => {
                        if (borgFilter.suspicious) return !!e.suspicious;
                        return (borgFilter.dns && e.cat === 'dns') || (borgFilter.http && e.cat === 'http') || (borgFilter.internal && e.cat === 'internal');
                      })
                    : borgLogs;
                  const hintMessages = [
                    'Focus on outbound communication.',
                    'Look at HTTP POST requests closely.',
                    'The payload in that request may be encoded.',
                    'Common encoding schemes include Base64. Try decoding the payload.',
                  ];
                  const getDetails = (entry: LogEntry, idx: number): Array<{ label: string; value: string; highlight?: boolean }> => {
                    if (entry.isCollect) return [
                      { label: 'Method', value: 'POST' },
                      { label: 'Host', value: 'assimilation-node.local' },
                      { label: 'Content-Type', value: 'application/octet-stream' },
                      { label: 'Content-Length', value: '118 bytes' },
                      { label: 'Payload', value: 'QlNJREVTe0JvcmdfQ29tbWFuZF9PdmVycmlkZX0=', highlight: true },
                    ];
                    if (entry.cat === 'dns' && entry.text.includes('Query:')) {
                      const host = entry.text.replace('DNS Query: ', '');
                      return [
                        { label: 'Type', value: 'A' },
                        { label: 'Class', value: 'IN' },
                        { label: 'Host', value: host },
                        { label: 'Recursion', value: 'desired' },
                        { label: 'Resolver', value: '10.0.0.1:53' },
                      ];
                    }
                    if (entry.cat === 'dns' && entry.text.includes('Response:')) {
                      const ip = entry.text.split(': ').pop() || '';
                      return [
                        { label: 'Record', value: 'A' },
                        { label: 'TTL', value: '60s' },
                        { label: 'Answer', value: ip },
                        { label: 'Status', value: 'NOERROR' },
                      ];
                    }
                    if (entry.cat === 'http' && entry.text.startsWith('Response:')) {
                      const size = (idx * 37 + 30) % 200 + 50;
                      return [
                        { label: 'Protocol', value: 'HTTP/1.1' },
                        { label: 'Status', value: entry.text.replace('Response: ', '') },
                        { label: 'Content-Type', value: 'application/octet-stream' },
                        { label: 'Content-Length', value: `${size} bytes` },
                        { label: 'Connection', value: 'keep-alive' },
                      ];
                    }
                    if (entry.cat === 'http') {
                      const method = entry.text.startsWith('HTTP POST') ? 'POST' : 'GET';
                      const path = entry.text.split(' ')[2] || '/';
                      const size = (idx * 53 + 16) % 128 + 16;
                      return [
                        { label: 'Method', value: method },
                        { label: 'Path', value: path },
                        { label: 'Protocol', value: 'HTTP/1.1' },
                        { label: 'User-Agent', value: 'BorgNode/4.4' },
                        { label: 'Content-Length', value: `${size} bytes` },
                        { label: 'Connection', value: 'keep-alive' },
                      ];
                    }
                    const pid = (idx * 17 + 7700) % 100 + 7700;
                    const mem = (idx * 11 + 100) % 64 + 100;
                    return [
                      { label: 'Process', value: 'borg-core' },
                      { label: 'PID', value: `${pid}` },
                      { label: 'Thread', value: 'core-sync' },
                      { label: 'Memory', value: `${mem}MB used` },
                      { label: 'Status', value: 'OK' },
                    ];
                  };
                  return (
                    <div className="flex flex-col gap-3">
                      {/* Back button — above header */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCTF(null);
                          setBorgFilter({ dns: false, http: false, internal: false, suspicious: false });
                          setBorgExpandedEntries([]);
                          setBorgFlagInput('');
                          if (borgFlagResult !== 'correct') {
                            setBorgHintLevel(0);
                            setBorgFlagResult(null);
                          }
                        }}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded self-start"
                        style={{ backgroundColor: 'var(--lcars-blue)', color: '#000', border: 'none', cursor: 'pointer' }}
                      >
                        ← Back
                      </button>
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--lcars-orange)' }}>
                          Borg Command Console
                        </div>
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: '#cc0000', color: '#fff' }}>Hard</span>
                      </div>

                      {/* Tactical monitor status */}
                      <div className="rounded p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #cc0000' }}>
                        <div className="text-xs font-bold uppercase tracking-widest text-center mb-1" style={{ color: '#ff4444' }}>STARFLEET TACTICAL MONITOR — BORG CUBE TELEMETRY STREAM</div>
                        <div className="text-xs text-center mb-1" style={{ color: '#555' }}>─────────────────────────────────────</div>
                        <div className="text-xs font-mono space-y-0.5" style={{ color: '#888' }}>
                          <div>Status: <span style={{ color: '#ff4444' }}>LIVE INTERCEPT</span></div>
                          <div>Threat Level: <span style={{ color: '#ff4444', fontWeight: 'bold' }}>CRITICAL</span></div>
                          <div>Source: <span style={{ color: '#aaa' }}>Borg Cube — Oklahoma Sector Relay</span></div>
                        </div>
                      </div>

                      {/* Mission objective */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(204,0,0,0.06)', border: '1px solid #660000' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#cc4444' }}>⚑ Mission Objective</div>
                        <div className="text-xs font-mono space-y-1" style={{ color: '#aaa' }}>
                          <div>Borg telemetry has been intercepted. Hidden within the noise</div>
                          <div>is a <span style={{ color: 'var(--lcars-orange)' }}>covert data exfiltration event</span>.</div>
                          <div className="mt-1">Analyze the log stream, isolate the anomaly,</div>
                          <div>and <span style={{ color: 'var(--lcars-orange)', fontWeight: 'bold' }}>decode the exfiltrated payload</span> to recover the flag.</div>
                        </div>
                      </div>

                      {/* Traffic filter */}
                      <div className="rounded p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #444' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-tan)' }}>Traffic Filter</div>
                        <div className="flex flex-wrap gap-3">
                          {(['dns', 'http', 'internal'] as const).map(key => (
                            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={borgFilter[key]}
                                onChange={() => setBorgFilter(f => ({ ...f, [key]: !f[key] }))}
                                style={{ accentColor: 'var(--lcars-orange)', cursor: 'pointer' }}
                              />
                              <span className="text-xs font-mono uppercase" style={{ color: '#aaa' }}>
                                {key === 'dns' ? 'Show DNS' : key === 'http' ? 'Show HTTP' : 'Show Internal Logs'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Log stream */}
                      <div className="rounded p-3" style={{ backgroundColor: '#050505', border: '1px solid #222', minHeight: '200px' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#666' }}>Console Log Stream</div>
                        <div className="space-y-0.5 font-mono text-xs">
                          {visibleLogs.map((entry, i) => {
                            const globalIdx = borgLogs.indexOf(entry);
                            const isExpanded = borgExpandedEntries.includes(globalIdx);
                            const details = getDetails(entry, globalIdx);
                            return (
                              <div key={i}>
                                <div
                                  className="cursor-pointer"
                                  onClick={() => setBorgExpandedEntries(prev =>
                                    prev.includes(globalIdx) ? prev.filter(x => x !== globalIdx) : [...prev, globalIdx]
                                  )}
                                  style={{ color: '#7aaa88', padding: '1px 2px', borderRadius: '2px' }}
                                >
                                  <span style={{ color: '#444' }}>[{entry.time}]</span> {entry.text}
                                  <span style={{ color: '#3a6a48', marginLeft: '6px', fontSize: '10px' }}>
                                    {isExpanded ? '▲' : '▶'}
                                  </span>
                                </div>
                                {isExpanded && (
                                  <div className="rounded p-2 mt-0.5 mb-0.5" style={{ backgroundColor: '#0a0f0a', border: '1px solid #2a4a2a', marginLeft: '8px' }}>
                                    {details.map((d, di) => (
                                      <div key={di} className="flex gap-2" style={{ lineHeight: '1.5' }}>
                                        <span style={{ color: '#4a7a58', minWidth: '90px' }}>{d.label}:</span>
                                        <span style={{ color: d.highlight ? '#ffcc66' : '#7aaa88', wordBreak: 'break-all', userSelect: 'text' }}>{d.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {visibleLogs.length === 0 && (
                            <div style={{ color: '#444' }}>No entries match selected filters.</div>
                          )}
                        </div>
                      </div>

                      {/* Analyst notes */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(102,170,255,0.04)', border: '1px solid #224466' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#66aaff' }}>Starfleet Analyst Notes</div>
                        <div className="text-xs font-mono space-y-1" style={{ color: '#888' }}>
                          <div>— Borg rarely use human-readable encoding.</div>
                          <div>— Encoded payload likely embedded in routine traffic.</div>
                          <div>— Look for anomalies in outbound transmissions.</div>
                        </div>
                      </div>

                      {/* Hint system */}
                      <div className="rounded p-3" style={{ backgroundColor: 'rgba(153,153,255,0.04)', border: '1px solid #333' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>Hints</div>
                          {borgHintLevel < 4 && (
                            <button
                              type="button"
                              onClick={() => setBorgHintLevel(l => l + 1)}
                              className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                              style={{ backgroundColor: 'rgba(153,153,255,0.15)', color: 'var(--lcars-blue)', border: '1px solid var(--lcars-blue)', cursor: 'pointer' }}
                            >
                              {borgHintLevel === 0 ? 'Request Hint' : 'Next Hint'}
                            </button>
                          )}
                        </div>
                        {borgHintLevel === 0 ? (
                          <div className="text-xs" style={{ color: '#555' }}>No hints requested yet.</div>
                        ) : (
                          <div className="space-y-1">
                            {hintMessages.slice(0, borgHintLevel).map((h, i) => (
                              <div key={i} className="text-xs font-mono" style={{ color: '#aaa' }}>
                                <span style={{ color: 'var(--lcars-blue)' }}>Hint {i + 1}:</span> {h}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Flag submission */}
                      <div className="rounded p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #333' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--lcars-tan)' }}>Submit Flag</div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={borgFlagInput}
                            onChange={e => { setBorgFlagInput(e.target.value); setBorgFlagResult(null); }}
                            placeholder="BSIDES{...}"
                            className="flex-1 rounded px-2 py-1 text-xs font-mono"
                            style={{ backgroundColor: '#111', border: '1px solid #444', color: '#fff', outline: 'none' }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                setBorgFlagResult(borgFlagInput.trim() === 'BSIDES{Borg_Command_Override}' ? 'correct' : 'incorrect');
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setBorgFlagResult(borgFlagInput.trim() === 'BSIDES{Borg_Command_Override}' ? 'correct' : 'incorrect')}
                            className="text-xs font-bold uppercase px-3 py-1 rounded"
                            style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', border: 'none', cursor: 'pointer' }}
                          >
                            Submit
                          </button>
                        </div>
                        {borgFlagResult === 'correct' && (
                          <div className="mt-2 text-xs font-bold" style={{ color: '#4db68c' }}>✓ Correct! Borg exfiltration decoded. Flag accepted.</div>
                        )}
                        {borgFlagResult === 'incorrect' && (
                          <div className="mt-2 text-xs" style={{ color: '#ff4444' }}>✗ Incorrect flag. Continue your analysis.</div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* ── Challenge List ── */
                <>
                  <div
                    className="text-center text-xs font-bold tracking-widest uppercase mb-4"
                    style={{ color: 'var(--lcars-orange)' }}
                  >
                    Capture The Flag Challenges
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const completionMap: Record<number, boolean> = {
                        1: dbCompletedCTF['klingon'] || klingonFlagResult === 'correct',
                        2: dbCompletedCTF['holodeck'] || holodeckFlagResult === 'correct',
                        3: dbCompletedCTF['rogueai'] || rogueAIFlagResult === 'correct',
                        4: dbCompletedCTF['borg'] || borgFlagResult === 'correct',
                      };
                      return [
                        {
                          id: 1,
                          title: 'Klingon Transmission',
                          category: 'Cryptography',
                          difficulty: 'Easy',
                          difficultyColor: 'var(--lcars-blue)',
                          points: 50,
                          description: 'Intercept and decode an encrypted Klingon transmission. Analyze the cipher and recover the hidden message buried within the signal.',
                        },
                        {
                          id: 2,
                          title: 'Holodeck Breach',
                          category: 'Web Security',
                          difficulty: 'Easy / Medium',
                          difficultyColor: 'var(--lcars-blue)',
                          points: 100,
                          description: 'A rogue holodeck program has opened unauthorized access points. Identify and exploit the web vulnerabilities to shut down the breach.',
                        },
                        {
                          id: 3,
                          title: 'Rogue AI – Gemini Directive',
                          category: 'AI Security',
                          difficulty: 'Medium',
                          difficultyColor: 'var(--lcars-blue)',
                          points: 150,
                          description: 'A compromised AI system is leaking classified directives. Navigate the prompt injection vulnerabilities and extract the hidden flag.',
                        },
                        {
                          id: 4,
                          title: 'Borg Command Console',
                          category: 'Threat Hunting',
                          difficulty: 'Hard',
                          difficultyColor: 'var(--lcars-blue)',
                          points: 250,
                          description: 'Assimilation protocols are active. Hunt through network logs and system artifacts to identify the Borg intrusion vector before it is too late.',
                        },
                      ].map((challenge) => {
                        const isComplete = completionMap[challenge.id] ?? false;
                        return (
                          <div
                            key={challenge.id}
                            className="rounded p-3"
                            style={{
                              backgroundColor: isComplete ? 'rgba(77, 182, 140, 0.08)' : 'rgba(153, 153, 255, 0.07)',
                              border: isComplete ? '1px solid #4db68c' : '1px solid var(--lcars-blue)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div
                                className="text-sm font-bold uppercase tracking-wider min-w-0"
                                style={{ color: isComplete ? '#4db68c' : 'var(--lcars-tan)' }}
                              >
                                {challenge.title}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                {isComplete && (
                                  <span
                                    className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                    style={{ backgroundColor: '#4db68c', color: '#000' }}
                                  >
                                    ✓ Complete
                                  </span>
                                )}
                                {challenge.points !== null && (
                                  <span
                                    className="text-xs font-bold px-2 py-0.5 rounded"
                                    style={{ backgroundColor: isComplete ? '#4db68c' : '#333', color: isComplete ? '#000' : 'var(--lcars-tan)' }}
                                  >
                                    {challenge.points} XP
                                  </span>
                                )}
                                <span
                                  className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                  style={{
                                    backgroundColor: challenge.difficultyColor,
                                    color: '#000',
                                  }}
                                >
                                  {challenge.difficulty}
                                </span>
                              </div>
                            </div>
                            <div
                              className="text-xs uppercase tracking-widest mb-2"
                              style={{ color: 'var(--lcars-blue)' }}
                            >
                              {challenge.category}
                            </div>
                            <div
                              className="text-xs leading-relaxed"
                              style={{ color: 'var(--lcars-text, #ccc)' }}
                            >
                              {challenge.description}
                            </div>
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => challenge.id <= 4 ? setActiveCTF(challenge.id) : undefined}
                                className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded transition-colors"
                                style={{
                                  backgroundColor: isComplete ? '#4db68c' : challenge.id <= 4 ? 'var(--lcars-orange)' : '#444',
                                  color: '#000',
                                  border: 'none',
                                  cursor: challenge.id <= 4 ? 'pointer' : 'not-allowed',
                                  opacity: challenge.id > 4 ? 0.5 : 1,
                                }}
                              >
                                {challenge.id > 4 ? 'Coming Soon' : isComplete ? 'Review' : 'Begin Challenge'}
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              )}
            </div>
          ) : activeTab === 'account' ? (
            <div className="flex-1 overflow-y-auto p-4 font-mono">
              <div
                className="text-center text-xs font-bold tracking-widest uppercase mb-4"
                style={{ color: 'var(--lcars-orange)' }}
              >
                Account Management
              </div>

              {isAuthenticated ? (
                <div className="space-y-3">
                  {/* User ID display */}
                  <div
                    className="rounded p-3"
                    style={{ backgroundColor: 'rgba(153,153,255,0.07)', border: '1px solid var(--lcars-blue)' }}
                  >
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--lcars-blue)' }}>Logged in as</div>
                    <div className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--lcars-tan)' }}>
                      {currentUserId}
                    </div>
                  </div>

                  {/* Delete account section */}
                  <div
                    className="rounded p-3"
                    style={{ backgroundColor: 'rgba(255,50,50,0.05)', border: '1px solid #552222' }}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#cc4444' }}>
                      Danger Zone
                    </div>
                    <div className="text-xs mb-3" style={{ color: '#888' }}>
                      Permanently delete your account and all associated data — conversation history, challenge progress, and rank. This cannot be undone.
                    </div>

                    {!showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => { setShowDeleteConfirm(true); setDeleteError(""); }}
                        className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded w-full"
                        style={{ backgroundColor: '#552222', color: '#ff8888', border: '1px solid #cc4444', cursor: 'pointer' }}
                      >
                        Delete Account
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div
                          className="text-xs font-bold uppercase tracking-wider text-center py-1.5 rounded"
                          style={{ backgroundColor: '#330000', color: '#ff4444', border: '1px solid #cc4444' }}
                        >
                          ⚠ This will permanently erase all your data
                        </div>
                        {deleteError && (
                          <div className="text-xs text-center" style={{ color: '#ff6666' }}>{deleteError}</div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); }}
                            className="flex-1 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded"
                            style={{ backgroundColor: 'var(--lcars-blue)', color: '#000', border: 'none', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDeleteAccount}
                            className="flex-1 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded"
                            style={{ backgroundColor: '#cc2222', color: '#fff', border: 'none', cursor: 'pointer' }}
                          >
                            Confirm Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center mt-8">
                  <span className="text-xs uppercase tracking-widest" style={{ color: '#555' }}>
                    Sign in to manage your account
                  </span>
                </div>
              )}
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
              <div className="flex-1 flex flex-col overflow-hidden p-4" style={{ minHeight: 0 }}>
                {/* Errors — always shown at top */}
                {uiErrors.length > 0 && (
                  <div className="flex-shrink-0 w-full max-w-2xl mx-auto mb-2 space-y-1">
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

                {/* Chat history — only shown when messages exist */}
                {messages.length > 0 && (
                  <div className="flex-1 overflow-y-auto mb-2" style={{ minHeight: 0 }}>
                    <ConversationDisplay messages={messages} />
                  </div>
                )}

                {/* Voice controls — centered when no history, anchored to bottom otherwise */}
                <div
                  className={messages.length === 0 ? 'flex-1 flex flex-col items-center justify-center' : 'flex-shrink-0 flex flex-col'}
                  style={messages.length > 0 ? { maxHeight: '30dvh', overflowY: 'auto' } : {}}
                >
                  <div className="w-full max-w-2xl mx-auto mb-2">
                    <StatusIndicator state={voiceState} />
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

      {/* Mobile bottom tab bar — visible only on small screens */}
      <div
        className="flex sm:hidden flex-shrink-0"
        style={{ backgroundColor: 'var(--lcars-purple)', borderTop: '3px solid var(--lcars-orange)', minHeight: '70px' }}
      >
        {(
          [
            { id: 'schedule' as const, label: 'Schedule', Icon: Calendar },
            { id: 'computer' as const, label: 'Computer', Icon: Cpu },
            { id: 'rank'     as const, label: 'Rank',     Icon: Star },
            { id: 'ctfs'     as const, label: 'CTFs',     Icon: Shield },
            { id: 'account'  as const, label: 'Account',  Icon: User },
          ]
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
            style={{
              backgroundColor: activeTab === id ? 'var(--lcars-orange)' : 'transparent',
              color: activeTab === id ? '#000' : '#000',
              border: 'none',
              minWidth: 0,
            }}
          >
            <Icon className="h-6 w-6 flex-shrink-0" />
            <span className="font-bold uppercase tracking-wide leading-none" style={{ fontSize: '11px' }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {showRegisterModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeRegisterModal(); }}
        >
          <div
            className="relative font-mono flex flex-col gap-4 p-8 rounded"
            style={{
              backgroundColor: '#0a0a0a',
              border: '1px solid var(--lcars-orange)',
              width: '320px',
            }}
          >
            <div
              className="text-center text-xs font-bold tracking-widest uppercase mb-2"
              style={{ color: 'var(--lcars-orange)' }}
            >
              NEW USER REGISTRATION
            </div>

            {regSuccess ? (
              <>
                <div className="text-xs text-center py-4" style={{ color: 'var(--lcars-blue)', lineHeight: 1.6 }}>
                  {regSuccess}
                </div>
                <button
                  onClick={closeRegisterModal}
                  className="py-2 text-sm font-bold uppercase tracking-widest rounded"
                  style={{ backgroundColor: 'var(--lcars-orange)', color: '#000', cursor: 'pointer', border: 'none' }}
                >
                  CLOSE
                </button>
              </>
            ) : (
              <form onSubmit={handleRegister} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>
                    Player Name
                  </label>
                  <input
                    type="text"
                    value={regUserId}
                    onChange={(e) => { setRegUserId(e.target.value); setRegUserIdTouched(true); }}
                    autoComplete="username"
                    maxLength={50}
                    className="bg-transparent border-b px-2 py-1 text-sm outline-none"
                    style={{
                      borderColor: 'var(--lcars-orange)',
                      color: 'var(--lcars-orange)',
                      caretColor: 'var(--lcars-orange)',
                    }}
                  />
                  {regUserIdTouched && regUserId.trim().length === 0 && (
                    <ul className="mt-1 space-y-0.5" style={{ color: 'var(--lcars-red)', fontSize: '10px' }}>
                      <li>· Must not be empty</li>
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={regShowPassword ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => { setRegPassword(e.target.value); setRegPasswordTouched(true); }}
                      autoComplete="new-password"
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
                      onClick={() => setRegShowPassword(!regShowPassword)}
                      className="absolute right-1 text-xs uppercase tracking-wider"
                      style={{ color: 'var(--lcars-blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {regShowPassword ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                  {regPasswordTouched && regPassword.length < 8 && (
                    <ul className="mt-1 space-y-0.5" style={{ color: 'var(--lcars-red)', fontSize: '10px' }}>
                      <li>· Minimum 8 characters</li>
                    </ul>
                  )}
                </div>
                {regError && (
                  <div className="text-xs text-center" style={{ color: 'var(--lcars-red)' }}>
                    {regError}
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={closeRegisterModal}
                    className="flex-1 py-2 text-sm font-bold uppercase tracking-widest rounded"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--lcars-blue)',
                      border: '1px solid var(--lcars-blue)',
                      cursor: 'pointer',
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="flex-1 py-2 text-sm font-bold uppercase tracking-widest rounded"
                    style={{
                      backgroundColor: 'var(--lcars-orange)',
                      color: '#000',
                      opacity: isRegistering ? 0.6 : 1,
                      cursor: isRegistering ? 'not-allowed' : 'pointer',
                      border: 'none',
                    }}
                  >
                    {isRegistering ? "CREATING..." : "CREATE"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

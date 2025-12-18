import { useState, useEffect, useCallback, useRef } from "react";

interface VoiceActivityDetectionResult {
  isVoiceDetected: boolean;
  audioLevel: number;
  startDetection: () => void;
  stopDetection: () => void;
  permissionState: 'unknown' | 'checking' | 'granted' | 'denied' | 'error';
  error: string | null;
}

const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const checkMicrophonePermission = async (): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> => {
  try {
    if (!navigator.permissions) {
      console.log("[VAD] Permissions API not supported");
      return 'unsupported';
    }
    
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    console.log("[VAD] Permission status:", result.state);
    return result.state as 'granted' | 'denied' | 'prompt';
  } catch (error) {
    console.warn("[VAD] Error checking microphone permission:", error);
    return 'unsupported';
  }
};

export function useVoiceActivityDetection(
  threshold: number = 0.01,
  onVoiceStart?: () => void,
  onVoiceEnd?: () => void,
  onError?: (error: string) => void
): VoiceActivityDetectionResult {
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [permissionState, setPermissionState] = useState<'unknown' | 'checking' | 'granted' | 'denied' | 'error'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false); // Prevents concurrent start attempts
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const detectVoice = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedLevel = average / 255;
    setAudioLevel(normalizedLevel);

    // Detect voice activity
    if (normalizedLevel > threshold) {
      if (!isVoiceDetected) {
        console.log("[VAD] Voice detected!", { level: normalizedLevel, threshold });
        setIsVoiceDetected(true);
        onVoiceStart?.();
      }
      
      // Reset voice end timeout
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
      }
      
      // Set timeout to detect when voice stops
      voiceTimeoutRef.current = setTimeout(() => {
        console.log("[VAD] Voice ended (1500ms silence)");
        setIsVoiceDetected(false);
        onVoiceEnd?.();
      }, 1500);
    }

    animationFrameRef.current = requestAnimationFrame(detectVoice);
  }, [threshold, isVoiceDetected, onVoiceStart, onVoiceEnd]);

  const startDetection = useCallback(async () => {
    const isMobile = isMobileDevice();
    const isProduction = import.meta.env.PROD;
    
    console.log("[VAD] startDetection called", { 
      isDetecting, 
      isStarting: isStartingRef.current,
      isStopping: isStoppingRef.current,
      hasStream: !!streamRef.current,
      currentPermissionState: permissionState,
      isMobile,
      isProduction,
      userAgent: navigator.userAgent 
    });
    
    // CRITICAL FIX: Wait for any ongoing stop to complete before starting
    if (isStoppingRef.current) {
      console.log("[VAD] Stop in progress, waiting for completion before starting");
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!isStoppingRef.current) {
            clearInterval(checkInterval);
            resolve(undefined);
          }
        }, 50);
        // Timeout after 2 seconds to prevent infinite wait
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(undefined);
        }, 2000);
      });
    }
    
    // Guard: Prevent concurrent start attempts
    if (isDetecting || isStartingRef.current) {
      console.log("[VAD] Already detecting or starting, skipping start");
      return;
    }
    
    // Set starting flag immediately to prevent concurrent calls
    isStartingRef.current = true;
    setError(null);
    
    // Only set to 'checking' if we don't already have permission granted
    if (permissionState !== 'granted') {
      setPermissionState('checking');
    }
    
    try {
      // Check permission status only if not already granted
      if (permissionState !== 'granted') {
        const permissionStatus = await checkMicrophonePermission();
        console.log("[VAD] Permission check result:", permissionStatus);
        
        if (permissionStatus === 'denied') {
          const errorMsg = isMobile 
            ? "Microphone access denied. Please enable microphone in browser settings."
            : "Microphone access denied. Please allow microphone access to use voice features.";
          console.error("[VAD] Permission denied before getUserMedia");
          setPermissionState('denied');
          setError(errorMsg);
          onError?.(errorMsg);
          return;
        }
      }
      
      // Guard: If stream exists, clean it up first (simplified cleanup)
      if (streamRef.current) {
        console.log("[VAD] Stream already exists, cleaning up before restart");
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => track.stop());
        streamRef.current = null;
        
        // Android needs more time to fully release microphone resources in production
        const cleanupDelay = isMobile && isProduction ? 300 : 100;
        console.log(`[VAD] Waiting ${cleanupDelay}ms for cleanup to complete`);
        await new Promise(resolve => setTimeout(resolve, cleanupDelay));
      }
      
      console.log("[VAD] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[VAD] Microphone access granted", { 
        streamId: stream.id,
        audioTracks: stream.getAudioTracks().length 
      });
      streamRef.current = stream;
      setPermissionState('granted');

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      microphoneRef.current = microphone;

      setIsDetecting(true);
      console.log("[VAD] Detection started successfully");
      detectVoice();
    } catch (error: any) {
      const errorName = error?.name || 'Unknown';
      const errorMessage = error?.message || 'Unknown error';
      
      console.error("[VAD] Error starting voice detection:", {
        error,
        errorName,
        errorMessage,
        isMobile,
        isProduction
      });
      
      let userFriendlyError = "Failed to access microphone.";
      
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        userFriendlyError = isMobile
          ? "Microphone access denied. Tap your browser's settings icon and enable microphone permissions for this site."
          : "Microphone access denied. Please allow microphone access when prompted.";
        setPermissionState('denied');
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        userFriendlyError = "No microphone found. Please connect a microphone and try again.";
        setPermissionState('error');
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
        userFriendlyError = isMobile
          ? "Microphone is busy. Close other apps using the microphone and try again."
          : "Microphone is already in use by another application.";
        setPermissionState('error');
      } else {
        userFriendlyError = `Microphone error: ${errorMessage}`;
        setPermissionState('error');
      }
      
      setError(userFriendlyError);
      onError?.(userFriendlyError);
    } finally {
      // Clear starting flag when done (success or error)
      isStartingRef.current = false;
    }
  }, [detectVoice, isDetecting, permissionState, onError]);

  const stopDetection = useCallback(async () => {
    console.log("[VAD] stopDetection called", { 
      isDetecting, 
      isStopping: isStoppingRef.current 
    });
    
    // Guard: prevent multiple stops
    if (!isDetecting || isStoppingRef.current) {
      console.log("[VAD] Skipping stop - already stopped or stopping");
      return;
    }
    isStoppingRef.current = true;
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear timeout
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }

    // Disconnect microphone
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }

    // Close AudioContext only if it exists and isn't already closed
    if (audioContextRef.current?.state !== 'closed') {
      try {
        await audioContextRef.current?.close();
        console.log("[VAD] AudioContext closed successfully");
      } catch (err) {
        console.warn("[VAD] Error closing AudioContext:", err);
      }
    }
    audioContextRef.current = null;

    // Stop media stream tracks synchronously (no requestAnimationFrame needed)
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      console.log("[VAD] Stopping media stream tracks", { trackCount: tracks.length });
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsDetecting(false);
    setIsVoiceDetected(false);
    setAudioLevel(0);
    // CRITICAL FIX: Don't reset permission state - preserve it for UI consistency
    // Permission state only changes when explicitly checking or on errors
    isStoppingRef.current = false;
    console.log("[VAD] Detection stopped successfully");
  }, [isDetecting]);

  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  return {
    isVoiceDetected,
    audioLevel,
    startDetection,
    stopDetection,
    permissionState,
    error,
  };
}

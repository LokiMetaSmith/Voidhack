import { Mic, MicOff, Volume2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceState } from "@shared/schema";

interface VoiceControlPanelProps {
  voiceState: VoiceState;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleContinuousMode?: () => void;
  isContinuousModeActive?: boolean;
  audioLevel?: number;
  permissionState?: 'unknown' | 'checking' | 'granted' | 'denied' | 'error';
  continuousModeAvailable?: boolean;
}

// Detect if user is on a mobile device
const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export function VoiceControlPanel({
  voiceState,
  onStartListening,
  onStopListening,
  onToggleContinuousMode,
  isContinuousModeActive = false,
  audioLevel = 0,
  permissionState = 'unknown',
  continuousModeAvailable = true,
}: VoiceControlPanelProps) {
  const isListening = voiceState === "listening";
  const isProcessing = voiceState === "processing";
  const isSpeaking = voiceState === "speaking";
  const isActive = isListening || isProcessing || isSpeaking || isContinuousModeActive;
  const isPermissionDenied = permissionState === 'denied';
  const isCheckingPermission = permissionState === 'checking';

  const getStatusLabel = () => {
    if (isCheckingPermission) {
      return "REQUESTING ACCESS";
    }
    if (isPermissionDenied) {
      return "ACCESS DENIED";
    }
    switch (voiceState) {
      case "listening":
        return "LISTENING";
      case "processing":
        return "PROCESSING";
      case "speaking":
        return "SPEAKING";
      default:
        return "READY";
    }
  };

  const getStatusColor = () => {
    if (isCheckingPermission) {
      return "text-chart-5";
    }
    if (isPermissionDenied) {
      return "text-destructive";
    }
    switch (voiceState) {
      case "listening":
        return "text-chart-4";
      case "processing":
        return "text-chart-5";
      case "speaking":
        return "text-chart-2";
      default:
        return "text-primary";
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      {/* Status Label */}
      <div className={`text-sm font-medium tracking-widest uppercase ${getStatusColor()}`}>
        {getStatusLabel()}
      </div>

      {/* Voice Control Button */}
      <div className="relative">
        <Button
          data-testid="button-voice-control"
          size="icon"
          variant={isActive ? "default" : "outline"}
          className={`h-32 w-32 rounded-full transition-all ${
            isListening ? "animate-pulse bg-chart-4 border-chart-4" : ""
          } ${isProcessing ? "bg-chart-5 border-chart-5" : ""} ${
            isSpeaking ? "bg-chart-2 border-chart-2" : ""
          } ${isCheckingPermission ? "bg-chart-5 border-chart-5 animate-pulse" : ""} ${
            isPermissionDenied ? "bg-destructive border-destructive" : ""
          } ${isContinuousModeActive && !isListening && !isProcessing && !isSpeaking && !isCheckingPermission ? "ring-4 ring-chart-4 ring-offset-2" : ""}`}
          onClick={
            continuousModeAvailable && onToggleContinuousMode
              ? onToggleContinuousMode
              : isListening
              ? onStopListening
              : onStartListening
          }
          disabled={isProcessing || isSpeaking || isCheckingPermission || isPermissionDenied}
        >
          {isCheckingPermission ? (
            <Mic className="h-16 w-16 opacity-50" />
          ) : isPermissionDenied ? (
            <AlertCircle className="h-16 w-16" />
          ) : isListening ? (
            <MicOff className="h-16 w-16" />
          ) : isSpeaking ? (
            <Volume2 className="h-16 w-16" />
          ) : (
            <Mic className="h-16 w-16" />
          )}
        </Button>

        {/* Audio Level Visualization */}
        {isListening && (
          <div className="absolute inset-0 -z-10 flex items-center justify-center">
            <div
              className="rounded-full bg-chart-4/20 transition-all duration-100"
              style={{
                width: `${132 + audioLevel * 40}px`,
                height: `${132 + audioLevel * 40}px`,
              }}
            />
          </div>
        )}
      </div>

      {/* Audio Waveform Visualization */}
      {isListening && (
        <div className="flex items-center justify-center gap-1 h-12" data-testid="waveform-visualization">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-chart-2 rounded-full transition-all duration-100"
              style={{
                height: `${8 + Math.random() * audioLevel * 32}px`,
                opacity: 0.6 + Math.random() * 0.4,
              }}
            />
          ))}
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="relative w-64 h-1 bg-secondary overflow-hidden rounded-full" data-testid="processing-indicator">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-chart-5 animate-scan-horizontal" />
        </div>
      )}

      {/* Instructions */}
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {isCheckingPermission
          ? "Requesting microphone access..."
          : isPermissionDenied
          ? "Microphone access denied. Check browser settings and refresh page."
          : isListening
          ? "Speak your query to the Enterprise Computer"
          : isProcessing
          ? "Computer is processing your request"
          : isSpeaking
          ? "Computer is responding"
          : isContinuousModeActive
          ? "Continuous mode active - Tap to stop"
          : continuousModeAvailable
          ? "Tap to activate continuous voice mode"
          : "Tap the button above to speak"}
      </p>

      {/* Mobile hint - shown on mobile devices when idle */}
      {isMobileDevice() && !isListening && !isProcessing && !isSpeaking && !isCheckingPermission && !isPermissionDenied && (
        <p className="text-xs text-muted-foreground/70 text-center max-w-xs mt-2" data-testid="text-mobile-hint">
          On mobile devices, use this on-screen button to activate voice input
        </p>
      )}
    </div>
  );
}

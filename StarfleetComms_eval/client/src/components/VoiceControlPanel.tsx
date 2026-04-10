import { Mic, MicOff, Volume2, AlertCircle } from "lucide-react";
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
    if (isCheckingPermission) return "REQUESTING ACCESS";
    if (isPermissionDenied) return "ACCESS DENIED";
    switch (voiceState) {
      case "listening": return "LISTENING";
      case "processing": return "PROCESSING";
      case "speaking": return "SPEAKING";
      default: return "READY";
    }
  };

  const getStatusColor = () => {
    if (isCheckingPermission) return 'var(--lcars-purple)';
    if (isPermissionDenied) return 'var(--lcars-red)';
    switch (voiceState) {
      case "listening": return 'var(--lcars-red)';
      case "processing": return 'var(--lcars-purple)';
      case "speaking": return 'var(--lcars-blue)';
      default: return 'var(--lcars-orange)';
    }
  };

  const getButtonBg = () => {
    if (isCheckingPermission) return 'var(--lcars-purple)';
    if (isPermissionDenied) return 'var(--lcars-red)';
    if (isListening) return 'var(--lcars-red)';
    if (isProcessing) return 'var(--lcars-purple)';
    if (isSpeaking) return 'var(--lcars-blue)';
    return 'transparent';
  };

  const getButtonBorder = () => {
    if (isActive) return getButtonBg();
    return 'var(--lcars-orange)';
  };

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="text-sm font-bold tracking-widest uppercase" style={{ color: getStatusColor() }}>
        {getStatusLabel()}
      </div>

      <div className="relative">
        <button
          data-testid="button-voice-control"
          className={`h-20 w-20 rounded-full transition-all duration-300 flex items-center justify-center ${
            isListening ? "animate-pulse" : ""
          }`}
          style={{
            backgroundColor: getButtonBg(),
            border: `3px solid ${getButtonBorder()}`,
            color: isActive ? '#000' : 'var(--lcars-orange)',
            cursor: isProcessing || isSpeaking || isCheckingPermission || isPermissionDenied ? 'not-allowed' : 'pointer',
            opacity: isProcessing || isSpeaking || isCheckingPermission || isPermissionDenied ? 0.7 : 1,
          }}
          onClick={
            isListening
              ? onStopListening
              : onStartListening
          }
          disabled={isProcessing || isSpeaking || isCheckingPermission || isPermissionDenied}
        >
          {isCheckingPermission ? (
            <Mic className="h-10 w-10 opacity-50" />
          ) : isPermissionDenied ? (
            <AlertCircle className="h-10 w-10" />
          ) : isListening ? (
            <MicOff className="h-10 w-10" />
          ) : isSpeaking ? (
            <Volume2 className="h-10 w-10" />
          ) : (
            <Mic className="h-10 w-10" />
          )}
        </button>

        {isListening && (
          <div className="absolute inset-0 -z-10 flex items-center justify-center">
            <div
              className="rounded-full transition-all duration-100"
              style={{
                width: `${84 + audioLevel * 30}px`,
                height: `${84 + audioLevel * 30}px`,
                backgroundColor: 'rgba(204, 0, 0, 0.2)',
              }}
            />
          </div>
        )}

        {isContinuousModeActive && !isListening && !isProcessing && !isSpeaking && !isCheckingPermission && (
          <div className="absolute inset-0 -z-10 flex items-center justify-center">
            <div
              className="rounded-full lcars-scan"
              style={{
                width: '92px',
                height: '92px',
                border: '2px solid var(--lcars-orange)',
              }}
            />
          </div>
        )}
      </div>

      {isListening && (
        <div className="flex items-center justify-center gap-1 h-12" data-testid="waveform-visualization">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full transition-all duration-100"
              style={{
                height: `${8 + Math.random() * audioLevel * 32}px`,
                opacity: 0.6 + Math.random() * 0.4,
                backgroundColor: 'var(--lcars-orange)',
              }}
            />
          ))}
        </div>
      )}

      {isProcessing && (
        <div className="relative w-64 h-1 overflow-hidden rounded-full" style={{ backgroundColor: '#333' }} data-testid="processing-indicator">
          <div className="absolute inset-y-0 left-0 w-1/3 animate-scan-horizontal" style={{ backgroundColor: 'var(--lcars-purple)' }} />
        </div>
      )}

      <p className="text-sm text-center max-w-sm" style={{ color: 'var(--lcars-tan)' }}>
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
          : "Tap the button to speak"}
      </p>
    </div>
  );
}

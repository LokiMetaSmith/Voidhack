import { VoiceState } from "@shared/schema";

interface StatusIndicatorProps {
  state: VoiceState;
}

export function StatusIndicator({ state }: StatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (state) {
      case "listening":
        return {
          color: 'var(--lcars-red)',
          label: "LISTENING",
          pulse: true,
        };
      case "processing":
        return {
          color: 'var(--lcars-purple)',
          label: "PROCESSING",
          pulse: true,
        };
      case "speaking":
        return {
          color: 'var(--lcars-blue)',
          label: "TRANSMITTING",
          pulse: true,
        };
      default:
        return {
          color: 'var(--lcars-orange)',
          label: "STANDBY",
          pulse: false,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-3" data-testid="status-indicator">
      <div className="relative">
        <div
          className={`h-3 w-3 rounded-full ${config.pulse ? "animate-pulse" : ""}`}
          style={{ backgroundColor: config.color }}
        />
        {config.pulse && (
          <div
            className="absolute inset-0 h-3 w-3 rounded-full opacity-50 animate-pulse"
            style={{ backgroundColor: config.color }}
          />
        )}
      </div>
      <span className="text-sm font-bold tracking-widest uppercase" style={{ color: config.color }}>
        {config.label}
      </span>
    </div>
  );
}

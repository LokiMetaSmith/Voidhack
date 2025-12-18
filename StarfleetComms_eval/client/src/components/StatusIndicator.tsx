import { VoiceState } from "@shared/schema";

interface StatusIndicatorProps {
  state: VoiceState;
}

export function StatusIndicator({ state }: StatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (state) {
      case "listening":
        return {
          color: "bg-chart-4",
          label: "ACTIVE",
          pulse: true,
        };
      case "processing":
        return {
          color: "bg-chart-5",
          label: "PROCESSING",
          pulse: true,
        };
      case "speaking":
        return {
          color: "bg-chart-2",
          label: "TRANSMITTING",
          pulse: true,
        };
      default:
        return {
          color: "bg-primary",
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
          className={`h-3 w-3 rounded-full ${config.color} ${
            config.pulse ? "animate-pulse" : ""
          }`}
        />
        {config.pulse && (
          <div
            className={`absolute inset-0 h-3 w-3 rounded-full ${config.color} opacity-50 animate-pulse`}
          />
        )}
      </div>
      <span className="text-xs font-medium tracking-wider uppercase text-muted-foreground">
        {config.label}
      </span>
    </div>
  );
}

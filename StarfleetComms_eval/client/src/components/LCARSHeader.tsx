import { Info, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface LCARSHeaderProps {
  onClearConversation?: () => void;
  isHandsFreeMode?: boolean;
  onHandsFreeModeChange?: (enabled: boolean) => void;
  voiceSettingsButton?: React.ReactNode;
}

export function LCARSHeader({ onClearConversation, isHandsFreeMode = false, onHandsFreeModeChange, voiceSettingsButton }: LCARSHeaderProps) {
  return (
    <header className="relative border-b border-border bg-card">
      {/* LCARS decorative bars */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-primary" />
      
      <div className="flex items-center justify-between p-4">
        {/* Left section with title */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:block w-2 h-12 bg-primary rounded-r-full" />
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-wider uppercase text-primary">
              USS ENTERPRISE
            </h1>
            <p className="text-xs text-muted-foreground tracking-widest uppercase">
              Computer Interface
            </p>
          </div>
        </div>

        {/* Right section with controls */}
        <div className="flex items-center gap-2">
          {onClearConversation && (
            <Button
              data-testid="button-clear-conversation"
              variant="outline"
              size="sm"
              onClick={onClearConversation}
              className="uppercase tracking-wider text-xs"
            >
              Clear
            </Button>
          )}

          {voiceSettingsButton}

          <Dialog>
            <DialogTrigger asChild>
              <Button
                data-testid="button-info"
                variant="ghost"
                size="icon"
              >
                <Info className="h-5 w-5" />
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
                      <li className="text-chart-4">Green: Listening to your voice</li>
                      <li className="text-chart-5">Yellow: Processing your request</li>
                      <li className="text-chart-2">Blue: Computer speaking</li>
                    </ul>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>

          <div className="hidden sm:block w-2 h-12 bg-chart-2 rounded-l-full" />
        </div>
      </div>

      {/* Bottom decorative bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-chart-2 to-chart-3" />
    </header>
  );
}

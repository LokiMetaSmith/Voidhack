import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface LCARSHeaderProps {
  onClearConversation?: () => void;
  isHandsFreeMode?: boolean;
  onHandsFreeModeChange?: (enabled: boolean) => void;
  voiceSettingsButton?: React.ReactNode;
  isAuthenticated?: boolean;
  onSignOut?: () => void;
}

export function LCARSHeader({ onClearConversation, isHandsFreeMode = false, onHandsFreeModeChange, voiceSettingsButton, isAuthenticated = false, onSignOut }: LCARSHeaderProps) {
  return (
    <header className="relative" style={{ backgroundColor: 'var(--lcars-purple)' }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderRadius: '0 0 0 50px' }}>
        <div />

        <div className="flex items-center gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wider uppercase" style={{ color: '#000' }}>
            United Federation of BSides
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={isAuthenticated ? onSignOut : undefined}
            className="uppercase tracking-wider text-xs font-bold"
            style={{ color: '#000' }}
          >
            {isAuthenticated ? "Sign Out" : "Sign In"}
          </Button>

          {onClearConversation && (
            <Button
              data-testid="button-clear-conversation"
              variant="ghost"
              size="sm"
              onClick={onClearConversation}
              className="uppercase tracking-wider text-xs"
              style={{ color: '#000', fontWeight: 'bold' }}
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
                style={{ color: '#000' }}
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
                      <li style={{ color: 'var(--lcars-red)' }}>Red: Listening to your voice</li>
                      <li style={{ color: 'var(--lcars-purple)' }}>Purple: Processing your request</li>
                      <li style={{ color: 'var(--lcars-blue)' }}>Blue: Computer speaking</li>
                    </ul>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}

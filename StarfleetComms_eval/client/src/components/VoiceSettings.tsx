import { useState, useEffect } from "react";
import { Settings, Volume2, Gauge, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { VoiceSettings } from "@/hooks/useSpeechSynthesis";

// Re-export for convenience
export type { VoiceSettings };

// Same priority list as useSpeechSynthesis.ts for consistency
const PREFERRED_VOICE_NAMES = [
  // iOS/macOS - these are the most common female voices on Apple devices
  "samantha", "ava", "allison", "susan", "kate", "serena", "emily",
  "siri female", "siri_female",
  // Windows
  "zira", "hazel",
  // Google Chrome voices
  "google uk english female", "google us english female",
  // Other female voices across platforms
  "female", "victoria", "karen", "moira", "fiona", "tessa", "veena",
];

// Male voices to explicitly exclude (these should never be selected)
const MALE_VOICE_NAMES = [
  "aaron", "daniel", "fred", "alex", "tom", "oliver", "gordon",
  "lee", "rishi", "david", "mark", "james", "george",
  "google uk english male", "google us english male", "male",
];

// Check if a voice is male
function isMaleVoice(voice: SpeechSynthesisVoice): boolean {
  const nameLower = voice.name.toLowerCase();
  return MALE_VOICE_NAMES.some(maleName => nameLower.includes(maleName));
}

export interface SoundSettings {
  enabled: boolean;
  volume: number;
}

interface VoiceSettingsProps {
  onSettingsChange?: (settings: VoiceSettings) => void;
  onSoundSettingsChange?: (settings: SoundSettings) => void;
}

export function VoiceSettingsPanel({ onSettingsChange, onSoundSettingsChange }: VoiceSettingsProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("Loading...");
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [rate, setRate] = useState(0.9);  // Slightly slower for Star Trek computer style
  const [pitch, setPitch] = useState(1.0);  // Natural pitch
  const [volume, setVolume] = useState(1.0);

  // Sound effects settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.4);

  // Load saved settings from localStorage
  useEffect(() => {
    const savedVoice = localStorage.getItem("voiceSettings");
    if (savedVoice) {
      try {
        const settings = JSON.parse(savedVoice);
        setRate(settings.rate ?? 0.9);  // Default to Star Trek computer pace
        setPitch(settings.pitch ?? 1.0);
        setVolume(settings.volume ?? 1.0);
      } catch (e) {
        console.error("Failed to load voice settings:", e);
      }
    }

    const savedSound = localStorage.getItem("soundSettings");
    if (savedSound) {
      try {
        const settings = JSON.parse(savedSound);
        setSoundEnabled(settings.enabled ?? true);
        setSoundVolume(settings.volume ?? 0.4);
      } catch (e) {
        console.error("Failed to load sound settings:", e);
      }
    }
  }, []);

  // Load voices and select best Star Trek computer-like female voice
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Log all voices for debugging (especially useful on iOS)
      console.log("[VoiceSettings] All voices:", availableVoices.map(v => `${v.name} (${v.lang})`).join(", "));

      // Filter to English voices
      const englishVoices = availableVoices.filter(v => v.lang.startsWith("en"));

      // Filter OUT male voices
      const femaleEnglishVoices = englishVoices.filter(v => !isMaleVoice(v));
      console.log("[VoiceSettings] Female English voices:", femaleEnglishVoices.map(v => v.name).join(", "));

      const voicesToSearch = femaleEnglishVoices.length > 0 ? femaleEnglishVoices : englishVoices;

      // Search for preferred voices in priority order (same as useSpeechSynthesis.ts)
      let foundVoice: SpeechSynthesisVoice | null = null;
      let foundIndex = -1;

      for (const preferredName of PREFERRED_VOICE_NAMES) {
        const matchedVoice = voicesToSearch.find(
          voice => voice.name.toLowerCase().includes(preferredName)
        );
        if (matchedVoice) {
          foundVoice = matchedVoice;
          foundIndex = availableVoices.indexOf(matchedVoice);
          console.log("[VoiceSettings] Selected voice:", matchedVoice.name, `(matched: "${preferredName}")`);
          break;
        }
      }

      if (foundVoice && foundIndex !== -1) {
        setSelectedVoiceIndex(foundIndex);
        setSelectedVoiceName(foundVoice.name);
        setVoiceAvailable(true);
      } else if (femaleEnglishVoices.length > 0) {
        // Fallback to first female English voice
        const fallback = femaleEnglishVoices[0];
        setSelectedVoiceIndex(availableVoices.indexOf(fallback));
        setSelectedVoiceName(fallback.name);
        setVoiceAvailable(true);
        console.log("[VoiceSettings] Using first female English voice:", fallback.name);
      } else if (englishVoices.length > 0) {
        // Last resort: any English voice
        const fallback = englishVoices[0];
        setSelectedVoiceIndex(availableVoices.indexOf(fallback));
        setSelectedVoiceName(fallback.name);
        setVoiceAvailable(true);
        console.warn("[VoiceSettings] No female voice found, using English voice:", fallback.name);
      } else {
        setVoiceAvailable(false);
        setSelectedVoiceName("No voice available");
        console.warn("[VoiceSettings] No voices available on this system");
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    // Only emit settings when voice is available
    if (!voiceAvailable) {
      return;
    }

    const settings = {
      voiceIndex: selectedVoiceIndex,
      rate,
      pitch,
      volume,
    };

    // Save to localStorage
    localStorage.setItem("voiceSettings", JSON.stringify(settings));

    // Notify parent
    onSettingsChange?.(settings);
  }, [selectedVoiceIndex, rate, pitch, volume, onSettingsChange, voiceAvailable]);

  useEffect(() => {
    const settings = {
      enabled: soundEnabled,
      volume: soundVolume,
    };

    // Save to localStorage
    localStorage.setItem("soundSettings", JSON.stringify(settings));

    // Notify parent
    onSoundSettingsChange?.(settings);
  }, [soundEnabled, soundVolume, onSoundSettingsChange]);

  const handlePreview = () => {
    if (!voiceAvailable) {
      console.error("Cannot preview: No voice available");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(
      "Computer systems are online and operational."
    );
    if (voices[selectedVoiceIndex]) {
      utterance.voice = voices[selectedVoiceIndex];
    }
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          data-testid="button-voice-settings"
          variant="ghost"
          size="icon"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Voice Settings</DialogTitle>
          <DialogDescription>
            Customize the Enterprise Computer voice output
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Voice Display (Read-only) */}
          <div className="space-y-2">
            <Label>Voice</Label>
            <div
              className={`flex h-9 w-full rounded-md border px-3 py-2 text-sm ${
                voiceAvailable
                  ? "border-input bg-muted"
                  : "border-destructive bg-destructive/10 text-destructive"
              }`}
              data-testid="text-voice-name"
            >
              {voiceAvailable && voices[selectedVoiceIndex]
                ? `${voices[selectedVoiceIndex].name} (${voices[selectedVoiceIndex].lang})`
                : selectedVoiceName}
            </div>
          </div>

          {/* Speech Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rate-slider" className="flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Speed
              </Label>
              <span className="text-sm text-muted-foreground">{rate.toFixed(2)}x</span>
            </div>
            <Slider
              id="rate-slider"
              data-testid="slider-rate"
              min={0.5}
              max={2.0}
              step={0.05}
              value={[rate]}
              onValueChange={([value]) => setRate(value)}
            />
          </div>

          {/* Pitch */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pitch-slider">Pitch</Label>
              <span className="text-sm text-muted-foreground">{pitch.toFixed(2)}</span>
            </div>
            <Slider
              id="pitch-slider"
              data-testid="slider-pitch"
              min={0.5}
              max={2.0}
              step={0.1}
              value={[pitch]}
              onValueChange={([value]) => setPitch(value)}
            />
          </div>

          {/* Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="volume-slider" className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Volume
              </Label>
              <span className="text-sm text-muted-foreground">{Math.round(volume * 100)}%</span>
            </div>
            <Slider
              id="volume-slider"
              data-testid="slider-volume"
              min={0}
              max={1}
              step={0.1}
              value={[volume]}
              onValueChange={([value]) => setVolume(value)}
            />
          </div>

          {/* Sound Effects Section */}
          <div className="border-t pt-6 space-y-4">
            <h4 className="text-sm font-semibold">Star Trek Sound Effects</h4>

            <div className="flex items-center justify-between">
              <Label htmlFor="sound-effects-toggle" className="flex items-center gap-2 cursor-pointer">
                <Zap className="h-4 w-4" />
                Enable Sound Effects
              </Label>
              <Switch
                id="sound-effects-toggle"
                data-testid="toggle-sound-effects"
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
              />
            </div>

            {soundEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sound-volume-slider" className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    Effects Volume
                  </Label>
                  <span className="text-sm text-muted-foreground">{Math.round(soundVolume * 100)}%</span>
                </div>
                <Slider
                  id="sound-volume-slider"
                  data-testid="slider-sound-volume"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[soundVolume]}
                  onValueChange={([value]) => setSoundVolume(value)}
                  disabled={!soundEnabled}
                />
              </div>
            )}
          </div>

          {/* Preview Button */}
          <Button
            data-testid="button-preview-voice"
            onClick={handlePreview}
            className="w-full"
            variant="outline"
            disabled={!voiceAvailable}
          >
            {voiceAvailable ? "Preview Voice" : "Voice Not Available"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

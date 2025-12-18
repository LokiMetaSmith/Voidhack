import { useState, useCallback, useEffect, useRef } from "react";

export interface VoiceSettings {
  voiceIndex?: number;
  rate?: number;
  pitch?: number;
  volume?: number;
}

// Prioritized list of female voices that sound like Star Trek computer
// These are calm, professional, clear female voices across platforms
const PREFERRED_VOICE_NAMES = [
  // iOS/macOS - these are the most common female voices on Apple devices
  "samantha",      // US English female - most common iOS default
  "ava",           // US English female - premium voice
  "allison",       // US English female
  "susan",         // UK English female
  "kate",          // UK English female
  "serena",        // UK English female
  "emily",         // UK English female
  "siri female",   // Siri voice
  "siri_female",
  // Windows
  "zira",
  "hazel",
  // Google Chrome voices
  "google uk english female",
  "google us english female",
  // Other female voices across platforms
  "female",
  "victoria",
  "karen",         // Australian English female
  "moira",         // Irish English female
  "fiona",         // Scottish English female
  "tessa",         // South African English female
  "veena",         // Indian English female
];

// Male voices to explicitly exclude (these should never be selected)
const MALE_VOICE_NAMES = [
  "aaron",         // iOS US male
  "daniel",        // iOS/macOS UK male
  "fred",          // macOS male
  "alex",          // macOS male
  "tom",           // UK male
  "oliver",        // UK male
  "gordon",        // UK male
  "lee",           // Australian male
  "rishi",         // Indian male
  "david",         // Windows male
  "mark",          // Windows male
  "james",         // male
  "george",        // male
  "google uk english male",
  "google us english male",
  "male",
];

interface SpeechSynthesisResult {
  speak: (text: string, settings?: VoiceSettings) => void;
  isSpeaking: boolean;
  cancel: () => void;
  warmUp: () => void;
}

function isIOSDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Check if a voice is male (should be excluded)
function isMaleVoice(voice: SpeechSynthesisVoice): boolean {
  const nameLower = voice.name.toLowerCase();
  return MALE_VOICE_NAMES.some(maleName => nameLower.includes(maleName));
}

// Find a preferred English female voice from the available voices
function findPreferredVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  // Log all available voices for debugging (especially useful for iOS)
  console.log("[SpeechSynthesis] All available voices:", 
    voices.map(v => `${v.name} (${v.lang})`).join(", ")
  );
  
  // Filter to only English voices first
  const englishVoices = voices.filter(voice => voice.lang.startsWith("en"));
  console.log("[SpeechSynthesis] English voices:", 
    englishVoices.map(v => `${v.name} (${v.lang})`).join(", ")
  );
  
  // Filter OUT male voices
  const femaleEnglishVoices = englishVoices.filter(voice => !isMaleVoice(voice));
  console.log("[SpeechSynthesis] Female English voices (after excluding males):", 
    femaleEnglishVoices.map(v => `${v.name} (${v.lang})`).join(", ")
  );
  
  const voicesToSearch = femaleEnglishVoices.length > 0 ? femaleEnglishVoices : englishVoices;
  
  // Search for preferred voices in priority order
  for (const preferredName of PREFERRED_VOICE_NAMES) {
    const matchedVoice = voicesToSearch.find(
      voice => voice.name.toLowerCase().includes(preferredName)
    );
    if (matchedVoice) {
      console.log("[SpeechSynthesis] Matched preferred voice:", matchedVoice.name, "for pattern:", preferredName);
      return matchedVoice;
    }
  }
  
  // Fallback: prefer any female English voice over male
  if (femaleEnglishVoices.length > 0) {
    console.log("[SpeechSynthesis] Using first female English voice as fallback:", femaleEnglishVoices[0].name);
    return femaleEnglishVoices[0];
  }
  
  // Last resort: any English voice (even if male, at least it's English)
  if (englishVoices.length > 0) {
    console.warn("[SpeechSynthesis] No female voice found, using first English voice:", englishVoices[0].name);
    return englishVoices[0];
  }
  
  console.warn("[SpeechSynthesis] No English voices found at all");
  return null;
}

// Poll for voices with timeout - iOS often delays voice loading
function waitForPreferredVoice(
  timeoutMs: number = 3000,
  pollIntervalMs: number = 100
): Promise<SpeechSynthesisVoice | null> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Check immediately
    const voices = window.speechSynthesis.getVoices();
    const preferred = findPreferredVoice(voices);
    if (preferred) {
      console.log("[SpeechSynthesis] Found preferred voice immediately:", preferred.name);
      resolve(preferred);
      return;
    }
    
    // Set up polling
    const pollInterval = setInterval(() => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = findPreferredVoice(voices);
      
      if (preferred) {
        console.log("[SpeechSynthesis] Found preferred voice after polling:", preferred.name);
        clearInterval(pollInterval);
        resolve(preferred);
        return;
      }
      
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.warn("[SpeechSynthesis] Timeout waiting for preferred voice, voices available:", voices.length);
        clearInterval(pollInterval);
        // Return any English voice or null
        const englishVoice = voices.find(v => v.lang.startsWith("en"));
        resolve(englishVoice || null);
      }
    }, pollIntervalMs);
    
    // Also listen for voiceschanged event
    const onVoicesChanged = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = findPreferredVoice(voices);
      if (preferred) {
        console.log("[SpeechSynthesis] Found preferred voice via voiceschanged:", preferred.name);
        clearInterval(pollInterval);
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(preferred);
      }
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    
    // Cleanup listener on timeout
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    }, timeoutMs + 100);
  });
}

export function useSpeechSynthesis(): SpeechSynthesisResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isWarmedUpRef = useRef(false);
  const pendingTextRef = useRef<{ text: string; settings?: VoiceSettings } | null>(null);
  const cachedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const isIOS = isIOSDevice();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleEnd = () => setIsSpeaking(false);
    window.speechSynthesis.addEventListener("end", handleEnd);

    // Pre-cache the preferred voice on mount
    const initVoice = async () => {
      const voice = await waitForPreferredVoice(2000, 100);
      if (voice) {
        cachedVoiceRef.current = voice;
        console.log("[SpeechSynthesis] Cached preferred voice on init:", voice.name);
      }
    };
    initVoice();

    return () => {
      window.speechSynthesis.removeEventListener("end", handleEnd);
      window.speechSynthesis.cancel();
    };
  }, []);

  const doSpeak = useCallback(async (text: string, settings?: VoiceSettings) => {
    console.log("[SpeechSynthesis] doSpeak called", { textLength: text.length, isIOS });
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings?.rate ?? 0.9;
    utterance.pitch = settings?.pitch ?? 1.0;
    utterance.volume = settings?.volume ?? 1.0;
    
    // CRITICAL: Force English language to prevent iOS from using non-English default
    utterance.lang = "en-US";

    // Get the voice - use cached if available, otherwise wait for it
    let selectedVoice = cachedVoiceRef.current;
    
    if (!selectedVoice) {
      console.log("[SpeechSynthesis] No cached voice, waiting for preferred voice...");
      selectedVoice = await waitForPreferredVoice(3000, 100);
      if (selectedVoice) {
        cachedVoiceRef.current = selectedVoice;
      }
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || "en-US";
      console.log("[SpeechSynthesis] Using voice:", selectedVoice.name, "lang:", utterance.lang);
    } else {
      console.warn("[SpeechSynthesis] No preferred voice found, using default with en-US lang");
      // Keep utterance.lang = "en-US" to at least get English
    }

    utterance.onstart = () => {
      console.log("[SpeechSynthesis] Speech started with voice:", utterance.voice?.name || "default");
      setIsSpeaking(true);
    };
    
    utterance.onend = () => {
      console.log("[SpeechSynthesis] Speech ended");
      setIsSpeaking(false);
    };
    
    utterance.onerror = (event) => {
      console.error("[SpeechSynthesis] Speech error:", event.error);
      setIsSpeaking(false);
    };

    console.log("[SpeechSynthesis] Speaking with voice:", utterance.voice?.name || "default", "lang:", utterance.lang);
    window.speechSynthesis.speak(utterance);
  }, [isIOS]);

  const speak = useCallback((text: string, settings?: VoiceSettings) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.error("[SpeechSynthesis] Speech synthesis not available");
      setIsSpeaking(true);
      setTimeout(() => setIsSpeaking(false), 100);
      return;
    }

    console.log("[SpeechSynthesis] speak called", { 
      isIOS, 
      isWarmedUp: isWarmedUpRef.current, 
      textLength: text.length 
    });

    // On iOS, we need to warm up first if not already done
    if (isIOS && !isWarmedUpRef.current) {
      console.log("[SpeechSynthesis] iOS not warmed up - queuing text and triggering warmUp");
      pendingTextRef.current = { text, settings };
      
      window.speechSynthesis.cancel();
      const silentUtterance = new SpeechSynthesisUtterance("");
      silentUtterance.volume = 0;
      silentUtterance.rate = 10;
      silentUtterance.lang = "en-US"; // Set language even for silent utterance
      
      const speakPending = () => {
        isWarmedUpRef.current = true;
        console.log("[SpeechSynthesis] warmUp complete");
        
        if (pendingTextRef.current) {
          console.log("[SpeechSynthesis] Speaking pending text after warmUp");
          const pending = pendingTextRef.current;
          pendingTextRef.current = null;
          // Small delay to ensure iOS is ready
          setTimeout(() => {
            doSpeak(pending.text, pending.settings);
          }, 100);
        }
      };
      
      silentUtterance.onend = speakPending;
      silentUtterance.onerror = (e) => {
        console.log("[SpeechSynthesis] silent warmUp error:", e.error);
        speakPending();
      };
      
      console.log("[SpeechSynthesis] auto-warmUp: speaking silent utterance");
      window.speechSynthesis.speak(silentUtterance);
      return;
    }

    doSpeak(text, settings);
  }, [isIOS, doSpeak]);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const warmUp = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.log("[SpeechSynthesis] warmUp: not available");
      return;
    }
    
    console.log("[SpeechSynthesis] warmUp called", { isIOS, isWarmedUp: isWarmedUpRef.current });
    
    if (isIOS && !isWarmedUpRef.current) {
      window.speechSynthesis.cancel();
      
      const silentUtterance = new SpeechSynthesisUtterance("");
      silentUtterance.volume = 0;
      silentUtterance.rate = 10;
      silentUtterance.lang = "en-US"; // Set language even for silent utterance
      
      silentUtterance.onend = () => {
        console.log("[SpeechSynthesis] warmUp: silent utterance ended, engine is ready");
        isWarmedUpRef.current = true;
        
        // Also try to cache the voice during warmUp
        waitForPreferredVoice(2000, 100).then(voice => {
          if (voice) {
            cachedVoiceRef.current = voice;
            console.log("[SpeechSynthesis] warmUp: cached voice:", voice.name);
          }
        });
        
        if (pendingTextRef.current) {
          console.log("[SpeechSynthesis] warmUp: speaking pending text");
          const pending = pendingTextRef.current;
          pendingTextRef.current = null;
          setTimeout(() => {
            doSpeak(pending.text, pending.settings);
          }, 100);
        }
      };
      
      silentUtterance.onerror = (e) => {
        console.log("[SpeechSynthesis] warmUp: error (this is often normal on iOS)", e.error);
        isWarmedUpRef.current = true;
        
        // Still try to cache voice
        waitForPreferredVoice(2000, 100).then(voice => {
          if (voice) {
            cachedVoiceRef.current = voice;
            console.log("[SpeechSynthesis] warmUp: cached voice after error:", voice.name);
          }
        });
        
        if (pendingTextRef.current) {
          console.log("[SpeechSynthesis] warmUp: speaking pending text after error");
          const pending = pendingTextRef.current;
          pendingTextRef.current = null;
          setTimeout(() => {
            doSpeak(pending.text, pending.settings);
          }, 100);
        }
      };
      
      console.log("[SpeechSynthesis] warmUp: speaking silent utterance to unlock iOS");
      window.speechSynthesis.speak(silentUtterance);
    } else if (!isIOS) {
      isWarmedUpRef.current = true;
    }
  }, [isIOS, doSpeak]);

  return {
    speak,
    isSpeaking,
    cancel,
    warmUp,
  };
}

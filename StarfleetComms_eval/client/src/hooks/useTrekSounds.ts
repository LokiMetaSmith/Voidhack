import { useCallback, useRef } from "react";

export type SoundEffect = "activate" | "listening" | "processing" | "complete" | "error" | "button";

interface TrekSoundsConfig {
  enabled: boolean;
  volume: number;
}

const SOUND_FILES: Record<SoundEffect, string> = {
  activate: "/sounds/activate.mp3",
  listening: "/sounds/listening.mp3",
  processing: "/sounds/processing.mp3",
  complete: "/sounds/complete.mp3",
  error: "/sounds/error.mp3",
  button: "/sounds/button.mp3",
};

export function useTrekSounds(config: TrekSoundsConfig = { enabled: true, volume: 0.5 }) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<SoundEffect, AudioBuffer>>(new Map());

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const loadSound = useCallback(async (effect: SoundEffect): Promise<AudioBuffer | null> => {
    if (audioBuffersRef.current.has(effect)) {
      return audioBuffersRef.current.get(effect)!;
    }

    try {
      const response = await fetch(SOUND_FILES[effect]);
      if (!response.ok) return null;
      
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = getAudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      audioBuffersRef.current.set(effect, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.debug(`Sound effect "${effect}" not available:`, error);
      return null;
    }
  }, [getAudioContext]);

  const playSound = useCallback(async (effect: SoundEffect) => {
    if (!config.enabled) return;

    try {
      const audioBuffer = await loadSound(effect);
      if (!audioBuffer) return;

      const audioContext = getAudioContext();
      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();

      source.buffer = audioBuffer;
      gainNode.gain.value = config.volume;

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      source.start(0);
    } catch (error) {
      console.debug(`Failed to play sound effect "${effect}":`, error);
    }
  }, [config.enabled, config.volume, loadSound, getAudioContext]);

  return { playSound };
}

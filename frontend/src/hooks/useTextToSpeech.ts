import { useState, useEffect, useCallback, useRef } from 'react';

export interface TextToSpeechOptions {
  lang?: string;
  voice?: SpeechSynthesisVoice;
  rate?: number;
  pitch?: number;
  volume?: number;
}

// Priority list for high-quality voices
const PREFERRED_VOICES = [
  "Google US English",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Guy Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Samantha",
  "Alex",
  "Fred", // Fallback
];

export function useTextToSpeech(defaultOptions: TextToSpeechOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Use a ref for options to avoid effect dependencies changing
  const optionsRef = useRef(defaultOptions);
  
  // Queue management
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    optionsRef.current = defaultOptions;
  }, [defaultOptions]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const synth = window.speechSynthesis;

    const updateVoices = () => {
      const available = synth.getVoices();
      setVoices(available);
    };

    updateVoices();
    
    // Chrome loads voices asynchronously
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }

    return () => {
      synth.cancel();
    };
  }, []);

  /**
   * Smartly selects the best available voice
   */
  const getBestVoice = useCallback((lang: string = 'en-US') => {
    if (!voices.length) return null;

    // 1. Try exact matches from our preferred list
    for (const name of PREFERRED_VOICES) {
      const match = voices.find(v => v.name === name || v.name.includes(name));
      if (match) return match;
    }

    // 2. Try to find a "Google" voice for the language (usually better quality)
    const googleVoice = voices.find(v => v.lang === lang && v.name.includes("Google"));
    if (googleVoice) return googleVoice;

    // 3. Try to find a "Microsoft" voice
    const msVoice = voices.find(v => v.lang === lang && v.name.includes("Microsoft"));
    if (msVoice) return msVoice;

    // 4. Fallback to default for language
    return voices.find(v => v.lang === lang && v.default) || voices.find(v => v.lang === lang);
  }, [voices]);

  /**
   * Process the queue of sentences
   */
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) {
      processingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    processingRef.current = true;
    const text = queueRef.current.shift()!;
    const synth = window.speechSynthesis;

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Use options from ref to avoid dependency cycle
    const currentOptions = optionsRef.current;
    
    // Configure utterance
    const bestVoice = currentOptions.voice || getBestVoice(currentOptions.lang || 'en-US');
    if (bestVoice) utterance.voice = bestVoice;

    utterance.lang = currentOptions.lang || 'en-US';
    utterance.rate = currentOptions.rate || 0.95; // Slightly slower for natural feel
    utterance.pitch = currentOptions.pitch || 1.0;
    utterance.volume = currentOptions.volume || 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      processQueue();
    };

    utterance.onerror = (event) => {
      console.error('TTS Error:', event);
      // Don't stop everything on one error, try next chunk
      processQueue();
    };

    try {
      synth.speak(utterance);
    } catch (err) {
      console.error("Speech synthesis failed", err);
      setIsSpeaking(false);
    }
  }, [getBestVoice]); // Removed optionsRef from dependencies

  const speak = useCallback((text: string, overrideOptions?: TextToSpeechOptions) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (overrideOptions) {
      optionsRef.current = { ...optionsRef.current, ...overrideOptions };
    }

    const synth = window.speechSynthesis;
    
    // Stop any current speech and clear queue
    synth.cancel();
    queueRef.current = [];

    // Split text into natural chunks (sentences)
    // This regex looks for periods, question marks, or exclamation marks followed by space or end of string
    // It keeps the delimiter
    const chunks = text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [text];

    // Add to queue
    queueRef.current = chunks.map(c => c.trim()).filter(c => c.length > 0);

    // Start processing
    processQueue();

  }, [processQueue]);

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    queueRef.current = [];
    processingRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    voices,
    supported: !!(typeof window !== 'undefined' && window.speechSynthesis)
  };
}

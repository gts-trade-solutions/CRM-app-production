'use client';

// Voice dictation via the Web Speech API — the cheap 80% of "voice CRM"
// for field reps. Renders nothing when the browser doesn't support it
// (Chrome/Edge do; en-IN recognition).

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function VoiceInput({
  onText,
  className,
}: {
  /** Called with each finalized transcript chunk. */
  onText: (text: string) => void;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(getRecognition() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = getRecognition();
    if (!recognition) return;
    recognition.lang = 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onTextRef.current(text);
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        toast.error('Microphone permission denied');
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      className={cn(
        listening && 'border-destructive text-destructive',
        className,
      )}
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
    >
      {listening ? <MicOff /> : <Mic />}
      {listening ? 'Listening…' : 'Dictate'}
    </Button>
  );
}

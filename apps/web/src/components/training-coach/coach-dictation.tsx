import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { coachCopy, useChineseCoach } from './coach-copy';

interface Recognition {
  lang: string;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function CoachDictation({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled: boolean;
}) {
  const speech = window as SpeechWindow;
  const SpeechRecognition =
    speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
  const chinese = useChineseCoach();
  const copy = coachCopy(chinese);
  const active = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState(false);
  const hintId = 'training-coach-dictation-hint';

  useEffect(
    () => () => {
      if (!active.current) return;
      active.current.onresult = null;
      active.current.onerror = null;
      active.current.onend = null;
      active.current.abort();
      active.current = null;
    },
    [],
  );

  if (!SpeechRecognition)
    return (
      <p className="text-sm text-muted-foreground">{copy.voice_error()}</p>
    );

  const toggle = () => {
    if (active.current) {
      active.current.stop();
      return;
    }
    setFailed(false);
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = chinese ? 'zh-CN' : navigator.language;
      recognition.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript.trim();
        if (text) onText(text);
      };
      recognition.onerror = () => setFailed(true);
      recognition.onend = () => {
        active.current = null;
        setListening(false);
      };
      recognition.start();
      active.current = recognition;
      setListening(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={toggle}
        disabled={disabled}
        aria-describedby={hintId}
        aria-pressed={listening}
      >
        {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        {listening ? copy.stop() : copy.speech()}
      </Button>
      <p id={hintId} className="text-sm text-muted-foreground" role="status">
        {failed ? copy.voice_error() : copy.voice_hint()}
      </p>
    </div>
  );
}

import { useGenerateEventMutation } from '@/api/agent';
import { useLocalAiModelsQuery } from '@/api/ai-settings';
import { m } from '@/paraglide/messages';
import { aiErrorCode, aiErrorMessage } from '@/utils/ai-errors';
import {
  AnalyticsEvent,
  analyticsErrorCodeFromUnknown,
} from '@/utils/analytics-events';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  AiErrorCode,
  CreateEventDto,
  GenerateEventDto,
} from '@openathlete/shared';

import { FormProvider } from '../hook-form';
import { RHFTextarea } from '../hook-form/rhf-textarea';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

type P = {
  open: boolean;
  onClose: () => void;
  date: Date;
  onEventGenerated: (event: CreateEventDto) => void;
  /** The session's athlete (a coach on an athlete's calendar) */
  athleteId?: number;
  /** PostHog funnel attribution (no PII). */
  analyticsSource?: string;
};

const promptSchema = z.object({
  prompt: z.string().min(1, m.required()).max(500),
});

type PromptFormValues = z.infer<typeof promptSchema>;

export function AIGenerateEventDialog({
  open,
  onClose,
  date,
  onEventGenerated,
  athleteId,
  analyticsSource = 'calendar',
}: P) {
  const posthog = usePostHog();
  const requestStartedAtRef = useRef<number | null>(null);

  const methods = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      prompt: '',
    },
  });

  const generateEventMutation = useGenerateEventMutation();
  const [failure, setFailure] = useState<{
    message: string;
    canTryLocal: boolean;
  }>();
  const { data: localModels } = useLocalAiModelsQuery(
    open && Boolean(failure?.canTryLocal),
  );
  const localFallback = localModels?.models.find(({ ready }) => ready);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      methods.reset({ prompt: '' });
      setFailure(undefined);
      posthog?.capture(AnalyticsEvent.ai_event_generation_opened, {
        mode: 'create',
        source: analyticsSource,
      });
    }
  }, [open, analyticsSource, posthog, methods]);

  const generate = async (
    data: PromptFormValues,
    localModel?: GenerateEventDto['localModel'],
  ) => {
    setFailure(undefined);
    requestStartedAtRef.current = performance.now();
    try {
      const generatedEvent = await generateEventMutation.mutateAsync({
        prompt: data.prompt,
        date,
        athleteId,
        localModel,
      });

      const durationMs =
        requestStartedAtRef.current !== null
          ? Math.round(performance.now() - requestStartedAtRef.current)
          : undefined;
      posthog?.capture(AnalyticsEvent.ai_event_generation_succeeded, {
        mode: 'create',
        source: analyticsSource,
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });

      toast.success(m.event_generated_successfully());
      onEventGenerated(generatedEvent);
      methods.reset();
      onClose();
    } catch (err) {
      const durationMs =
        requestStartedAtRef.current !== null
          ? Math.round(performance.now() - requestStartedAtRef.current)
          : undefined;
      posthog?.capture(AnalyticsEvent.ai_event_generation_failed, {
        mode: 'create',
        source: analyticsSource,
        error_code: analyticsErrorCodeFromUnknown(err),
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });
      const code = aiErrorCode(err);
      setFailure({
        message: aiErrorMessage(err) ?? m.failed_to_generate_event(),
        canTryLocal:
          !localModel &&
          (code === AiErrorCode.QUOTA_EXCEEDED ||
            code === AiErrorCode.PROVIDER_ERROR),
      });
    }
  };
  const onSubmit = methods.handleSubmit((data) => generate(data));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        mobileFullscreen
        className={`sm:max-w-2xl ${generateEventMutation.isPending ? 'overflow-visible' : ''}`}
      >
        <div
          className={
            generateEventMutation.isPending
              ? 'ai-rotating-brand-border-dialog'
              : ''
          }
        >
          <DialogHeader>
            <DialogTitle>{m.create_with_ai()}</DialogTitle>
            <DialogDescription>
              {m.ai_generate_event_dialog_description()}
            </DialogDescription>
          </DialogHeader>
          <FormProvider methods={methods} onSubmit={onSubmit}>
            <div className="space-y-4 pt-3">
              <RHFTextarea
                name="prompt"
                label={m.ai_generate_event_prompt_label()}
                placeholder={m.ai_generate_event_prompt_placeholder()}
                className="min-h-[120px]"
                required
                disabled={generateEventMutation.isPending}
              />
              {failure && (
                <p role="alert" className="text-sm text-destructive-foreground">
                  {failure.message}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {failure?.canTryLocal && localFallback && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={methods.handleSubmit((data) =>
                      generate(data, localFallback.id),
                    )}
                  >
                    {m.ai_generate_event_retry_local({
                      model: localFallback.name,
                    })}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={generateEventMutation.isPending}
                >
                  {m.cancel()}
                </Button>
                <Button
                  type="submit"
                  isLoading={generateEventMutation.isPending}
                >
                  {generateEventMutation.isPending
                    ? m.generating_event()
                    : m.generate()}
                </Button>
              </div>
            </div>
          </FormProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

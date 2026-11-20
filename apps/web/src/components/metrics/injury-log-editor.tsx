import { useDeleteInjuryLog, useSaveInjuryLog } from '@/api/injury';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SelectItem } from '@/components/ui/select';
import { m } from '@/paraglide/messages';
import { injuryStatusLabelMap } from '@/utils/label-map/core';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  AthleteInjury,
  INJURY_STATUS,
  SaveInjuryLog,
  saveInjuryLogSchema,
} from '@openathlete/shared';

import {
  FormProvider,
  RHFSelect,
  RHFTextField,
  RHFTextarea,
} from '../hook-form';

export function InjuryLogEditor({
  entry,
  onClose,
}: {
  entry: AthleteInjury | null;
  onClose: () => void;
}) {
  const save = useSaveInjuryLog();
  const methods = useForm<SaveInjuryLog>({
    resolver: zodResolver(
      saveInjuryLogSchema.extend({
        painScore: z.number().min(0).max(10),
      }),
    ),
    defaultValues: {
      location: entry?.location ?? '',
      painScore: entry ? Math.round(entry.painScore * 100) / 10 : 0,
      status: entry?.status ?? INJURY_STATUS.STABLE,
      context: entry?.context ?? '',
    },
  });
  const submit = methods.handleSubmit((values) => {
    save.mutate(
      {
        data: { ...values, painScore: values.painScore / 10 },
        id: entry?.athleteInjuryId,
      },
      {
        onSuccess: onClose,
        onError: () => toast.error(m.injury_log_action_failed()),
      },
    );
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry ? m.injury_log_edit() : m.injury_log_add()}
          </DialogTitle>
          <DialogDescription>{m.injury_log_private()}</DialogDescription>
        </DialogHeader>
        <FormProvider methods={methods} onSubmit={submit}>
          <fieldset disabled={save.isPending} className="space-y-4">
            <RHFTextField
              name="location"
              label={m.location()}
              required
              maxLength={100}
            />
            <RHFTextField
              name="painScore"
              label={m.injury_log_pain()}
              type="number"
              min={0}
              max={10}
              step={0.1}
              required
            />
            <RHFSelect name="status" label={m.status()}>
              {Object.values(INJURY_STATUS).map((value) => (
                <SelectItem key={value} value={value}>
                  {injuryStatusLabelMap[value]}
                </SelectItem>
              ))}
            </RHFSelect>
            <RHFTextarea
              name="context"
              label={m.context()}
              maxLength={2000}
              rows={4}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {m.cancel()}
              </Button>
              <Button type="submit">{m.save()}</Button>
            </DialogFooter>
          </fieldset>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteInjuryLogDialog({
  entry,
  onClose,
}: {
  entry: AthleteInjury;
  onClose: () => void;
}) {
  const remove = useDeleteInjuryLog();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.injury_log_delete()}</DialogTitle>
          <DialogDescription>
            {m.injury_log_delete_confirm({ location: entry.location })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={remove.isPending}
          >
            {m.cancel()}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(entry.athleteInjuryId, {
                onSuccess: onClose,
                onError: () => toast.error(m.injury_log_action_failed()),
              })
            }
          >
            {m.delete_()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

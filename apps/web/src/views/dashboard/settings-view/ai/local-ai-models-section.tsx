import {
  useAiAccessQuery,
  useLocalAiModelsQuery,
  useSelectLocalAiModelMutation,
} from '@/api/ai-settings';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { Cpu } from 'lucide-react';
import { toast } from 'sonner';

import {
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from '../settings-section';

export function LocalAiModelsSection() {
  const { data } = useLocalAiModelsQuery();
  const { data: access } = useAiAccessQuery();
  const select = useSelectLocalAiModelMutation();
  if (!data?.enabled) return null;

  return (
    <SettingsSection
      title={m.ai_local_title()}
      description={m.ai_local_description()}
    >
      <SettingsPanel>
        {data.models.map((model) => {
          const chosen = data.selected === model.id;
          return (
            <SettingsRow
              key={model.id}
              leading={<Cpu className="size-5" />}
              title={model.name}
              description={
                model.ready
                  ? model.id === 'qwen3:4b'
                    ? m.ai_local_qwen()
                    : m.ai_local_gemma()
                  : m.ai_local_unavailable()
              }
            >
              <Button
                variant={chosen ? 'outline' : 'default'}
                size="sm"
                disabled={!model.ready || select.isPending || chosen}
                onClick={() =>
                  select.mutate(
                    { modelId: model.id },
                    { onError: () => toast.error(m.ai_error_provider()) },
                  )
                }
              >
                {chosen ? m.ai_local_selected() : m.ai_local_choose()}
              </Button>
            </SettingsRow>
          );
        })}
      </SettingsPanel>
      {data.selected && access && !access.dataSharingConsent && (
        <p className="text-sm text-muted-foreground">
          {m.ai_local_enable_processing()}
        </p>
      )}
    </SettingsSection>
  );
}

import {
  useAiAccessQuery,
  useAuthorizeOpenRouterFreeMutation,
  useDeleteAiCredentialMutation,
  useExchangeOpenRouterFreeMutation,
  useOpenRouterFreeQuery,
  useSelectOpenRouterFreeMutation,
} from '@/api/ai-settings';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { m } from '@/paraglide/messages';
import { Cloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { OPENROUTER_FREE_AUTO } from '@openathlete/shared';

import {
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from '../settings-section';
import { isOpenRouterReturn } from './openrouter-return';

export function OpenRouterFreeSection() {
  const { data } = useOpenRouterFreeQuery();
  const { data: access } = useAiAccessQuery();
  const [params, setParams] = useSearchParams();
  const [pendingModel, setPendingModel] = useState<string>();
  const [signInFailed, setSignInFailed] = useState(false);
  const handled = useRef(false);
  const authorize = useAuthorizeOpenRouterFreeMutation();
  const { mutate: exchange, isPending: isExchanging } =
    useExchangeOpenRouterFreeMutation();
  const select = useSelectOpenRouterFreeMutation();
  const remove = useDeleteAiCredentialMutation();

  useEffect(() => {
    if (!isOpenRouterReturn(params)) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    handled.current = true;
    const code = params.get('code');
    const state = params.get('state');
    const cleaned = new URLSearchParams(params);
    [
      'code',
      'state',
      'openrouter_return',
      'error',
      'error_description',
    ].forEach((key) => cleaned.delete(key));
    cleaned.set('tab', 'ai');
    setParams(cleaned, { replace: true });
    if (!code || !state) {
      setSignInFailed(true);
      return;
    }
    exchange(
      { code, state },
      {
        onSuccess: () => setSignInFailed(false),
        onError: () => setSignInFailed(true),
      },
    );
  }, [params, setParams, exchange]);

  if (!data?.enabled) return null;

  const choice =
    pendingModel ??
    (data.selected === OPENROUTER_FREE_AUTO ||
    data.models.some(({ id }) => id === data.selected)
      ? data.selected
      : OPENROUTER_FREE_AUTO) ??
    OPENROUTER_FREE_AUTO;
  const credentialId = data.credentialId;
  const models = [
    { id: OPENROUTER_FREE_AUTO, name: m.ai_free_auto() },
    ...data.models,
  ];

  return (
    <SettingsSection
      title={m.ai_free_title()}
      description={m.ai_free_description()}
    >
      <SettingsPanel>
        <SettingsRow
          stacked
          leading={<Cloud className="size-5" />}
          title="OpenRouter"
          description={m.ai_free_disclosure()}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={credentialId ? 'outline' : 'default'}
              disabled={authorize.isPending || isExchanging || remove.isPending}
              onClick={() => {
                setSignInFailed(false);
                authorize.mutate(undefined, {
                  onSuccess: ({ url }) => window.location.assign(url),
                  onError: () => setSignInFailed(true),
                });
              }}
            >
              {isExchanging
                ? m.ai_free_connecting()
                : credentialId
                  ? m.ai_free_reconnect()
                  : m.ai_free_signin()}
            </Button>
            {credentialId !== null && (
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(credentialId, {
                    onSuccess: () => {
                      setPendingModel(undefined);
                      toast.success(m.ai_free_disconnected());
                    },
                    onError: () => toast.error(m.ai_error_provider()),
                  })
                }
              >
                {m.ai_free_disconnect()}
              </Button>
            )}
          </div>
        </SettingsRow>
        <SettingsRow
          stacked
          title={m.ai_free_models()}
          description={
            data.remaining
              ? m.ai_free_quota({
                  left: String(data.remaining.left),
                  limit: String(data.remaining.limit),
                })
              : m.ai_free_catalog_hint({ count: String(data.models.length) })
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select value={choice} onValueChange={setPendingModel}>
              <SelectTrigger
                className="w-full min-w-0 max-w-sm"
                aria-label={m.ai_free_models()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map(({ id, name }) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={
                credentialId === null ||
                choice === data.selected ||
                select.isPending
              }
              onClick={() =>
                select.mutate(choice, {
                  onSuccess: () => setPendingModel(undefined),
                  onError: () => toast.error(m.ai_error_provider()),
                })
              }
            >
              {choice === data.selected
                ? m.ai_local_selected()
                : m.ai_local_choose()}
            </Button>
          </div>
        </SettingsRow>
      </SettingsPanel>
      {signInFailed ? (
        <p className="text-sm text-destructive" role="alert">
          {m.ai_free_signin_failed()}
        </p>
      ) : (
        credentialId !== null && (
          <p className="text-sm text-muted-foreground" role="status">
            {m.ai_free_connected()}
          </p>
        )
      )}
      {data.selected && access && !access.dataSharingConsent && (
        <p className="text-sm text-muted-foreground">
          {m.ai_local_enable_processing()}
        </p>
      )}
    </SettingsSection>
  );
}

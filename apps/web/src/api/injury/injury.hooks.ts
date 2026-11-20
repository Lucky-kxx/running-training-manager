import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SaveInjuryLog } from '@openathlete/shared';

import { InjuryAPI } from './injury.api';

const injuryKey = ['injuries'];

export function useGetInjuriesQuery(athleteId?: number) {
  return useQuery({
    queryKey: [...injuryKey, athleteId],
    queryFn: () => InjuryAPI.getInjuries(athleteId),
  });
}

export function useSaveInjuryLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ data, id }: { data: SaveInjuryLog; id?: number }) =>
      InjuryAPI.saveLog(data, id),
    onSuccess: () => client.invalidateQueries({ queryKey: injuryKey }),
  });
}

export function useDeleteInjuryLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: InjuryAPI.deleteLog,
    onSuccess: () => client.invalidateQueries({ queryKey: injuryKey }),
  });
}

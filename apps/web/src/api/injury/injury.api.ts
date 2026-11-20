import client, { routes } from '@/utils/axios';

import { AthleteInjury, SaveInjuryLog } from '@openathlete/shared';

export class InjuryAPI {
  static async getInjuries(athleteId?: number): Promise<AthleteInjury[]> {
    const res = await client.get(routes.injury.getInjuries, {
      params: athleteId ? { athleteId } : undefined,
    });
    return res.data;
  }

  static async saveLog(data: SaveInjuryLog, id?: number) {
    if (id === undefined) await client.post(routes.injury.getInjuries, data);
    else await client.patch(routes.injury.entry(id), data);
  }

  static async deleteLog(id: number) {
    await client.delete(routes.injury.entry(id));
  }
}

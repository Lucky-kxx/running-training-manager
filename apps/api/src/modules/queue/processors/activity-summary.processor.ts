import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';

import { ActivitySummaryListener } from 'src/listeners/activity-summary.listener';

export interface ActivitySummaryJobData {
  eventActivityId: number;
  userId: number;
  chinese?: boolean;
}

@Processor('activity-summary', { concurrency: 1 })
export class ActivitySummaryProcessor extends WorkerHost {
  constructor(private readonly summaries: ActivitySummaryListener) {
    super();
  }

  async process(job: Job<ActivitySummaryJobData>) {
    const { eventActivityId, ...manual } = job.data;
    await this.summaries.summarise(eventActivityId, manual);
  }
}

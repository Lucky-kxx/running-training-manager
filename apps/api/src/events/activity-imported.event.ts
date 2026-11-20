type ActivityImportedPayload = {
  eventActivityId: number;
  eventId: number;
  bulkImport?: boolean;
  generateAiSummary?: boolean;
};

export class ActivityImportedEvent {
  static readonly SLUG = 'activity.imported';

  constructor(public readonly payload: ActivityImportedPayload) {}
}

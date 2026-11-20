import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  garminPersonalStatusSchema,
  garminPersonalSyncResponseSchema,
  garminPersonalSyncSchema,
} from '@openathlete/shared';

import { GarminPersonalService } from '../../../providers-sync/garmin-personal/garmin-personal-service';
import { ToolContext, ToolError, run } from '../context';
import { READ_ONLY, registerTool } from './deps';

export function registerGarminTools(
  server: McpServer,
  ctx: ToolContext,
  garmin: GarminPersonalService,
) {
  if (ctx.can('read')) {
    registerTool(
      server,
      'get_garmin_sync_status',
      {
        title: 'Garmin import status',
        description:
          "Check the signed-in athlete's connection and the result of their latest import.",
        inputSchema: {},
        outputSchema: garminPersonalStatusSchema,
        annotations: READ_ONLY,
      },
      () =>
        run(garminPersonalStatusSchema, () => garmin.status(ctx.user.userId)),
    );
  }

  if (ctx.can('write')) {
    registerTool(
      server,
      'sync_garmin_activities',
      {
        title: 'Import activities from Garmin',
        description:
          'Queue up to 28 days from your own connected Garmin account. Set the key and enable imports in web settings first. Check get_garmin_sync_status for completion.',
        inputSchema: { startDate: z.string(), endDate: z.string() },
        outputSchema: garminPersonalSyncResponseSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      (args) =>
        run(garminPersonalSyncResponseSchema, () => {
          const range = garminPersonalSyncSchema.safeParse(args);
          if (!range.success)
            throw new ToolError(
              'Use valid YYYY-MM-DD dates covering up to 28 days ending today or earlier.',
            );
          return garmin.enqueue(ctx.user.userId, range.data);
        }),
    );
  }
}

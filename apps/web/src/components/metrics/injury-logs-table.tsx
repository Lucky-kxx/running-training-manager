import { useGetInjuriesQuery } from '@/api/injury';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SkeletonTableRow } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { m } from '@/paraglide/messages';
import { getPainScoreColor } from '@/utils/color';
import { injuryStatusLabelMap } from '@/utils/label-map/core';
import { cn } from '@/utils/shadcn';
import { format } from 'date-fns';
import { useState } from 'react';

import { AthleteInjury } from '@openathlete/shared';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { DeleteInjuryLogDialog, InjuryLogEditor } from './injury-log-editor';

interface InjuryLogsTableProps {
  canManage: boolean;
  athleteId?: number;
  className?: string;
}

export function InjuryLogsTable({
  athleteId,
  canManage,
  className,
}: InjuryLogsTableProps) {
  const {
    data: injuries = [],
    isLoading,
    isError,
    refetch,
  } = useGetInjuriesQuery(athleteId);
  const [editor, setEditor] = useState<AthleteInjury | null | undefined>();
  const [deleting, setDeleting] = useState<AthleteInjury>();

  return (
    <Card className={className}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>{m.injury_logs()}</CardTitle>
          <CardDescription>{m.injury_logs_description()}</CardDescription>
        </div>
        {canManage && (
          <Button className="min-h-11" onClick={() => setEditor(null)}>
            {m.injury_log_add()}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            {m.injury_log_load_failed()}
            <Button variant="outline" onClick={() => void refetch()}>
              {m.injury_log_retry()}
            </Button>
          </div>
        ) : !isLoading && injuries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.no_injuries_found()}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.date()}</TableHead>
                <TableHead>{m.location()}</TableHead>
                <TableHead>{m.pain_score()}</TableHead>
                <TableHead>{m.status()}</TableHead>
                <TableHead>{m.context()}</TableHead>
                {canManage && <TableHead>{m.actions()}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 3 }, (_, index) => (
                  <SkeletonTableRow key={index} colCount={canManage ? 6 : 5} />
                ))}
              {injuries.map((injury) => (
                <TableRow key={injury.athleteInjuryId}>
                  <TableCell>
                    {format(new Date(injury.updatedAt), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">
                    {injury.location}
                  </TableCell>
                  <TableCell>
                    <div
                      className={cn(
                        'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold',
                        getPainScoreColor(injury.painScore),
                      )}
                    >
                      {Math.round(injury.painScore * 100) / 10}/10
                    </div>
                  </TableCell>
                  <TableCell>{injuryStatusLabelMap[injury.status]}</TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TableCell className="max-w-md truncate">
                        {injury.context}
                      </TableCell>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">{injury.context}</p>
                    </TooltipContent>
                  </Tooltip>
                  {canManage && (
                    <TableCell>
                      {injury.privateLog && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            onClick={() => setEditor(injury)}
                          >
                            {m.edit()}
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            onClick={() => setDeleting(injury)}
                          >
                            {m.delete_()}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {canManage && editor !== undefined && (
        <InjuryLogEditor entry={editor} onClose={() => setEditor(undefined)} />
      )}
      {canManage && deleting && (
        <DeleteInjuryLogDialog
          entry={deleting}
          onClose={() => setDeleting(undefined)}
        />
      )}
    </Card>
  );
}

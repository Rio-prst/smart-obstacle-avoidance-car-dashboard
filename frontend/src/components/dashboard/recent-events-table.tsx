import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatEventDetail, formatEventType, formatWibTime } from '@/lib/format';
import { modeStyle } from '@/lib/status-style';
import type { DeviceEvent } from '@/types/api';

interface RecentEventsTableProps {
  events: DeviceEvent[];
}

export function RecentEventsTable({ events }: RecentEventsTableProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Event Terbaru</CardTitle>
          <CardDescription>10 event terakhir dari perangkat dan server</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/history">
            Lihat riwayat
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {events.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Belum ada event.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const mode = modeStyle(event.mode);

                return (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatWibTime(event.ts)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-medium">
                      {formatEventType(event.type)}
                    </TableCell>
                    <TableCell>
                      <Badge className={mode.className}>{mode.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatEventDetail(event.detail)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

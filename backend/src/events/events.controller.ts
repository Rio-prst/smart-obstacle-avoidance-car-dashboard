import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventQueryDto } from './dto/event-query.dto';
import { EventListResult, EventsService } from './events.service';

@Controller('devices/:id/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(@Param('id') id: string, @Query() query: EventQueryDto): Promise<EventListResult> {
    return this.events.list(id, query);
  }
}

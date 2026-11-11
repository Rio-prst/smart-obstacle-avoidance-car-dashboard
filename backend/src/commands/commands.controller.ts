import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CommandItem, CommandCreateResult, CommandsService } from './commands.service';
import { CreateCommandDto } from './dto/create-command.dto';
import { CommandQueryDto } from './dto/command-query.dto';

@Controller('devices/:id/commands')
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Post()
  @HttpCode(202)
  async create(
    @Param('id') id: string,
    @Body() body: CreateCommandDto,
  ): Promise<{ data: CommandCreateResult }> {
    return { data: await this.commands.create(id, body) };
  }

  @Get()
  async list(
    @Param('id') id: string,
    @Query() query: CommandQueryDto,
  ): Promise<{ data: CommandItem[] }> {
    return { data: await this.commands.list(id, query) };
  }
}

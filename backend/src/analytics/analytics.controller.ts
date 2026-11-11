import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('devices/:id/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('sensor')
  async getSensor(@Param('id') id: string, @Query() query: AnalyticsQueryDto) {
    return await this.analytics.getSensor(id, query);
  }

  @Get('state-distribution')
  async getStateDistribution(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return await this.analytics.getStateDistribution(id, query);
  }

  @Get('avoidance')
  async getAvoidance(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return await this.analytics.getAvoidance(id, query);
  }

  @Get('commands')
  async getCommands(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return await this.analytics.getCommands(id, query);
  }

  @Get('connectivity')
  async getConnectivity(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return await this.analytics.getConnectivity(id, query);
  }

  @Get('stop-distance')
  async getStopDistance(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return await this.analytics.getStopDistance(id, query);
  }

  @Get('config-comparison')
  async getConfigComparison(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return await this.analytics.getConfigComparison(id, query);
  }

  @Get('overview')
  async getOverview(@Param('id') id: string, @Query() query: AnalyticsQueryDto) {
    return await this.analytics.getOverview(id, query);
  }
}

import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'live' } {
    return { status: 'live' };
  }
}

import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { RuntimeReadiness } from './runtime-readiness.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(RuntimeReadiness) private readonly readiness: RuntimeReadiness) {}

  @Get('live')
  live(): { status: 'live' } {
    return { status: 'live' };
  }

  @Get('ready')
  ready(@Res() reply: FastifyReply): void {
    const ready = this.readiness.status().ready;
    reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not-ready' });
  }
}

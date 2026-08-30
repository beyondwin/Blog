import { type DynamicModule, Module } from '@nestjs/common';

import { HealthController } from './health/health.controller.js';
import { PublicAnswerModule, type PublicAnswerModuleRuntime } from './modules/public-answer/public-answer.module.js';

@Module({})
export class AppModule {
  static register(runtime: PublicAnswerModuleRuntime): DynamicModule {
    return {
      module: AppModule,
      imports: [PublicAnswerModule.register(runtime)],
      controllers: [HealthController],
    };
  }
}

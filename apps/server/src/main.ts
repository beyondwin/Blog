import 'reflect-metadata';

import { pathToFileURL } from 'node:url';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

export async function createApplication(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ bodyLimit: 4096 });
  return NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
}

export async function startApplication(): Promise<NestFastifyApplication> {
  const app = await createApplication();
  await app.listen(3000, '127.0.0.1');
  return app;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await startApplication();
}

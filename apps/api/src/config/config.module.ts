import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.config';

export const ENV_TOKEN = Symbol('ENV');

@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: [ENV_TOKEN],
})
export class ConfigModule {}

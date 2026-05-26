import { Inject, Injectable } from '@nestjs/common';
import {
  glofoxCredentialsSchema,
  gymmasterCredentialsSchema,
  mindbodyCredentialsSchema,
  virtuagymCredentialsSchema,
  zenotiCredentialsSchema,
  type CrmProvider,
} from '@steady-state/shared-types';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import type { CrmConnector } from './connector.interface';
import { GlofoxFakeConnector } from './glofox/glofox.fake-connector';
import { GlofoxHttpConnector } from './glofox/glofox.http-connector';
import { GymmasterFakeConnector } from './gymmaster/gymmaster.fake-connector';
import { GymmasterHttpConnector } from './gymmaster/gymmaster.http-connector';
import { MindbodyFakeConnector } from './mindbody/mindbody.fake-connector';
import { MindbodyHttpConnector } from './mindbody/mindbody.http-connector';
import { VirtuagymFakeConnector } from './virtuagym/virtuagym.fake-connector';
import { VirtuagymHttpConnector } from './virtuagym/virtuagym.http-connector';
import { ZenotiFakeConnector } from './zenoti/zenoti.fake-connector';
import { ZenotiHttpConnector } from './zenoti/zenoti.http-connector';

@Injectable()
export class CrmConnectorFactory {
  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  create(provider: CrmProvider, credentials: unknown): CrmConnector {
    if (this.env.CRM_MODE === 'fake') {
      return this.createFake(provider);
    }
    return this.createHttp(provider, credentials);
  }

  private createFake(provider: CrmProvider): CrmConnector {
    switch (provider) {
      case 'mindbody':
        return new MindbodyFakeConnector();
      case 'glofox':
        return new GlofoxFakeConnector();
      case 'zenoti':
        return new ZenotiFakeConnector();
      case 'virtuagym':
        return new VirtuagymFakeConnector();
      case 'gymmaster':
        return new GymmasterFakeConnector();
      default:
        throw new Error(`No fake connector implemented for provider: ${provider}`);
    }
  }

  private createHttp(provider: CrmProvider, credentials: unknown): CrmConnector {
    switch (provider) {
      case 'mindbody':
        return new MindbodyHttpConnector(mindbodyCredentialsSchema.parse(credentials));
      case 'glofox':
        return new GlofoxHttpConnector(glofoxCredentialsSchema.parse(credentials));
      case 'zenoti':
        return new ZenotiHttpConnector(zenotiCredentialsSchema.parse(credentials));
      case 'virtuagym':
        return new VirtuagymHttpConnector(virtuagymCredentialsSchema.parse(credentials));
      case 'gymmaster':
        return new GymmasterHttpConnector(gymmasterCredentialsSchema.parse(credentials));
      default:
        throw new Error(`No HTTP connector implemented for provider: ${provider}`);
    }
  }
}

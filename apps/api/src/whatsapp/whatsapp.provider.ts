import type { WhatsappSendRequest, WhatsappSendResult } from '@steady-state/shared-types';

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsappProvider {
  send(request: WhatsappSendRequest): Promise<WhatsappSendResult>;
}

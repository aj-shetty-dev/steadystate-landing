import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedMember } from './member-auth.guard';

export const CurrentMember = createParamDecorator<undefined, ExecutionContext, AuthenticatedMember>(
  (_data, ctx) => {
    const req = ctx.switchToHttp().getRequest<Request & { member?: AuthenticatedMember }>();
    if (!req.member) throw new Error('CurrentMember used without MemberAuthGuard');
    return req.member;
  },
);

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './jwt.strategy';

const TRACKED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const method = req.method;
    if (!TRACKED_METHODS.has(method)) return next.handle();
    const user = req.user;
    if (!user?.tenantId) return next.handle();

    const action = `${method} ${req.route?.path ?? req.path}`;
    const resourceType = (req.route?.path ?? req.path).split('/').filter(Boolean)[0] ?? 'unknown';
    const ip = (req.ip ?? req.socket.remoteAddress) ?? null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    return next.handle().pipe(
      tap({
        next: (result) => {
          const resourceId =
            (result && typeof result === 'object' && 'id' in result && typeof (result as { id: unknown }).id === 'string'
              ? (result as { id: string }).id
              : null) ?? (typeof req.params?.id === 'string' ? req.params.id : null);
          this.prisma.auditLog
            .create({
              data: {
                tenantId: user.tenantId,
                userId: user.id,
                action,
                resourceType,
                resourceId,
                ip,
                userAgent,
              },
            })
            .catch((err) => this.logger.warn(`Audit log write failed: ${(err as Error).message}`));
        },
      }),
    );
  }
}

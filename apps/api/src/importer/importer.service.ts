import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'papaparse';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

const memberCsvRowSchema = z.object({
  externalId: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  fullName: z.string().min(1),
  email: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional()),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164'),
  membershipStatus: z.enum(['ACTIVE', 'EXPIRED', 'PAUSED', 'FROZEN', 'CANCELLED', 'PENDING', 'PENDING_PAYMENT']).default('PENDING'),
  joinedAt: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
});

export type MemberCsvRow = z.infer<typeof memberCsvRowSchema>;

export interface ImportPlan {
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; error: string }>;
  toCreate: MemberCsvRow[];
  toUpdate: Array<{ id: string; row: MemberCsvRow }>;
  unchanged: number;
}

export interface ImportResult extends ImportPlan {
  applied: boolean;
  created: number;
  updated: number;
}

@Injectable()
export class ImporterService {
  constructor(private readonly prisma: PrismaService) {}

  parseCsv(csv: string): Array<{ row: number; raw: Record<string, string> }> {
    const out = parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
    if (out.errors.length) {
      throw new BadRequestException(`CSV parse errors: ${out.errors.map((e) => e.message).join('; ')}`);
    }
    return out.data.map((raw, i) => ({ row: i + 2, raw }));
  }

  async planMembers(tenantId: string, csv: string): Promise<ImportPlan> {
    const rows = this.parseCsv(csv);
    const errors: ImportPlan['errors'] = [];
    const valid: Array<{ row: number; data: MemberCsvRow }> = [];

    for (const r of rows) {
      const parsed = memberCsvRowSchema.safeParse(r.raw);
      if (!parsed.success) {
        errors.push({ row: r.row, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      valid.push({ row: r.row, data: parsed.data });
    }

    const phones = valid.map((v) => v.data.phone);
    const externalIds = valid.map((v) => v.data.externalId).filter((x): x is string => !!x);
    const existing = await this.prisma.member.findMany({
      where: {
        tenantId,
        OR: [
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(externalIds.length ? [{ externalId: { in: externalIds } }] : []),
        ],
      },
      select: { id: true, externalId: true, phone: true, fullName: true, email: true, membershipStatus: true },
    });
    const byPhone = new Map(existing.map((e) => [e.phone ?? '', e]));
    const byExt = new Map(existing.map((e) => [e.externalId, e]));

    const toCreate: MemberCsvRow[] = [];
    const toUpdate: Array<{ id: string; row: MemberCsvRow }> = [];
    let unchanged = 0;

    for (const { data } of valid) {
      const match = (data.externalId && byExt.get(data.externalId)) ?? byPhone.get(data.phone) ?? null;
      if (!match) {
        toCreate.push(data);
        continue;
      }
      const diff =
        match.fullName !== data.fullName ||
        (match.email ?? undefined) !== data.email ||
        match.membershipStatus !== data.membershipStatus;
      if (diff) toUpdate.push({ id: match.id, row: data });
      else unchanged += 1;
    }

    return {
      totalRows: rows.length,
      validRows: valid.length,
      errors,
      toCreate,
      toUpdate,
      unchanged,
    };
  }

  async applyMembers(tenantId: string, csv: string): Promise<ImportResult> {
    const plan = await this.planMembers(tenantId, csv);
    let created = 0;
    let updated = 0;

    for (const row of plan.toCreate) {
      await this.prisma.member.create({
        data: {
          tenantId,
          externalId: row.externalId ?? `import-${Date.now()}-${created}`,
          fullName: row.fullName,
          email: row.email,
          phone: row.phone,
          membershipStatus: row.membershipStatus,
          joinedAt: row.joinedAt ? new Date(row.joinedAt) : new Date(),
          source: 'CRM_IMPORT',
          raw: { import: true },
        },
      });
      created += 1;
    }
    for (const { id, row } of plan.toUpdate) {
      await this.prisma.member.update({
        where: { id },
        data: {
          fullName: row.fullName,
          email: row.email,
          membershipStatus: row.membershipStatus,
        },
      });
      updated += 1;
    }

    return { ...plan, applied: true, created, updated };
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

interface CsvRow {
  externalId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  membershipStatus?: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      (row as any)[h] = values[i] ?? '';
    });
    return row;
  });
}

const VALID_STATUSES = ['ACTIVE', 'PENDING', 'PAUSED', 'FROZEN', 'EXPIRED', 'CANCELLED', 'PENDING_PAYMENT'];

// ---------------------------------------------------------------------------
// POST /api/importer/members/apply
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const { csv } = (await req.json()) as { csv?: string };

  if (!csv) {
    return NextResponse.json({ message: 'CSV data is required' }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json({ message: 'No valid rows found in CSV' }, { status: 400 });
  }

  const errors: Array<{ row: number; error: string }> = [];
  const toCreate: Array<{ fullName: string; phone: string; email?: string }> = [];
  const toUpdate: Array<{ id: string; row: { fullName: string; phone: string; email?: string } }> = [];
  let unchanged = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;
    // Normalize: headers are lowercased during parse, so access by lowercase key
    const fullName = row.fullName || (row as any).fullname || '';
    const phone = row.phone || '';
    const email = row.email || '';

    if (!fullName) {
      errors.push({ row: lineNum, error: 'Missing fullName' });
      continue;
    }

    const cleaned = {
      fullName,
      phone,
      email: email || undefined,
    };
    if (email) (cleaned as any).email = email;

    if (phone) {
      const existing = await prisma.member.findFirst({
        where: { phone, tenantId: user.tenantId },
        select: { id: true, fullName: true },
      });
      if (existing) {
        if (existing.fullName === fullName) {
          unchanged++;
        } else {
          toUpdate.push({ id: existing.id, row: cleaned });
        }
        continue;
      }
    }

    toCreate.push(cleaned);
  }

  let created = 0;
  let updated = 0;

  // Create new members
  for (const row of toCreate) {
    try {
      await prisma.member.create({
        data: {
          tenantId: user.tenantId,
          externalId: crypto.randomUUID(),
          provider: 'NATIVE',
          source: 'MANUAL',
          fullName: row.fullName,
          phone: row.phone || null,
          email: row.email ?? null,
          membershipStatus: 'ACTIVE',
          joinedAt: new Date(),
          raw: {},
        },
      });
      created++;
    } catch (err) {
      errors.push({ row: 0, error: `Failed to create ${row.fullName}: ${(err as Error).message}` });
    }
  }

  // Update existing members
  for (const { id, row } of toUpdate) {
    try {
      await prisma.member.update({
        where: { id },
        data: {
          fullName: row.fullName,
          email: row.email ?? undefined,
        },
      });
      updated++;
    } catch (err) {
      errors.push({ row: 0, error: `Failed to update ${row.fullName}: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({
    applied: true,
    totalRows: rows.length,
    validRows: toCreate.length + toUpdate.length + unchanged,
    errors,
    toCreate,
    toUpdate,
    unchanged,
    created,
    updated,
  });
}

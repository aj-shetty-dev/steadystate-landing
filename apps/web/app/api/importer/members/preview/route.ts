import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

const previewSchema = z.object({
  csv: z.string().min(1, 'CSV data is required.'),
});

function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s\-\(\)\.]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith('0')) return `+971${trimmed.slice(1)}`;
  return trimmed ? `+${trimmed}` : trimmed;
}

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

// ---------------------------------------------------------------------------
// POST /api/importer/members/preview
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'CSV data is required' },
      { status: 400 },
    );
  }

  const csv = parsed.data.csv;

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
    const lineNum = i + 2; // 1-indexed + header row

    // Normalize: headers are lowercased during parse, so access by lowercase key
    const fullName = row.fullName || (row as any).fullname || '';
    const phone = normalizePhone(row.phone || '');
    const email = row.email || '';

    if (!fullName) {
      errors.push({ row: lineNum, error: 'Missing fullName' });
      continue;
    }

    const cleaned: { fullName: string; phone: string; email?: string } = {
      fullName,
      phone,
    };
    if (email) cleaned.email = email;

    // Check if member exists by phone
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

  return NextResponse.json({
    totalRows: rows.length,
    validRows: toCreate.length + toUpdate.length + unchanged,
    errors,
    toCreate,
    toUpdate,
    unchanged,
  });
}

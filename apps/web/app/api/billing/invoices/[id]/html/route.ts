import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/billing/invoices/:id/html
// ---------------------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { member: { select: { fullName: true, phone: true, email: true } } },
  });

  if (!invoice) {
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  }

  const amountAed = (invoice.amountAed / 100).toFixed(2);
  const vatAed = (invoice.vatAed / 100).toFixed(2);
  const totalAed = ((invoice.amountAed + invoice.vatAed) / 100).toFixed(2);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${invoice.id.slice(0, 8)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #1c1917; }
    h1 { font-size: 24px; margin-bottom: 0; }
    .ref { color: #6b6863; font-size: 14px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b6863; padding: 8px 0; border-bottom: 1px solid #e5e3e0; }
    td { padding: 8px 0; border-bottom: 1px solid #f2f1ef; }
    .total { font-size: 18px; font-weight: 600; text-align: right; margin-top: 16px; }
    .footer { font-size: 12px; color: #6b6863; margin-top: 40px; }
  </style>
</head>
<body>
  <h1>Invoice</h1>
  <div class="ref">#${invoice.id.slice(0, 8)} · ${new Date(invoice.createdAt).toLocaleDateString('en-AE')}</div>

  <table>
    <tr><td><strong>Bill to</strong></td><td>${invoice.member.fullName}</td></tr>
    ${invoice.member.phone ? `<tr><td>Phone</td><td>${invoice.member.phone}</td></tr>` : ''}
    ${invoice.member.email ? `<tr><td>Email</td><td>${invoice.member.email}</td></tr>` : ''}
    <tr><td>Due date</td><td>${new Date(invoice.dueDate).toLocaleDateString('en-AE')}</td></tr>
    <tr><td>Status</td><td>${invoice.status}</td></tr>
    ${invoice.description ? `<tr><td>Description</td><td>${invoice.description}</td></tr>` : ''}
  </table>

  <table>
    <thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      <tr><td>Subtotal</td><td style="text-align:right">AED ${amountAed}</td></tr>
      ${invoice.vatAed > 0 ? `<tr><td>VAT</td><td style="text-align:right">AED ${vatAed}</td></tr>` : ''}
    </tbody>
  </table>

  <div class="total">Total: AED ${totalAed}</div>
  <div class="footer">SteadyState · Generated on ${new Date().toLocaleDateString('en-AE')}</div>
</body>
</html>`;

  return NextResponse.json({ html });
}

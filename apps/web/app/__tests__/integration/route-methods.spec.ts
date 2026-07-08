/**
 * Route Method Verification — Integration Tests
 *
 * Verifies every API route exports the HTTP methods that the frontend actually uses.
 * This catches 405 "Method Not Allowed" bugs BEFORE they reach production.
 *
 * Found bugs:
 * - Salary window: frontend sent PUT, route only had POST
 * - Deactivate member: frontend sent PATCH, route only had POST
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'fs';
import path from 'path';

// Resolve from vitest's root dir (apps/web) to app/api
const API_DIR = path.resolve(process.cwd(), 'app/api');

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RouteExpectation {
  file: string;
  expectedMethods: HttpMethod[];
  frontendUse: string; // description of where the frontend calls this
}

// Every API route and the HTTP methods the frontend actually uses
const EXPECTATIONS: RouteExpectation[] = [
  { file: 'auth/me/route.ts', expectedMethods: ['GET'], frontendUse: 'dashboard layout' },
  { file: 'auth/onboard/route.ts', expectedMethods: ['POST'], frontendUse: 'onboarding page' },

  { file: 'members/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create' },
  { file: 'members/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + edit' },
  { file: 'members/[id]/deactivate/route.ts', expectedMethods: ['POST', 'PATCH'], frontendUse: 'deactivate from list & detail' },

  { file: 'memberships/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create' },
  { file: 'memberships/[id]/freeze/route.ts', expectedMethods: ['POST'], frontendUse: 'freeze action' },
  { file: 'memberships/[id]/unfreeze/route.ts', expectedMethods: ['POST'], frontendUse: 'unfreeze action' },
  { file: 'memberships/[id]/cancel/route.ts', expectedMethods: ['POST'], frontendUse: 'cancel action' },
  { file: 'memberships/[id]/activate/route.ts', expectedMethods: ['POST'], frontendUse: 'activate action' },
  { file: 'memberships/[id]/change-plan/route.ts', expectedMethods: ['POST'], frontendUse: 'change plan action' },
  { file: 'memberships/process-renewals/route.ts', expectedMethods: ['POST'], frontendUse: 'process renewals button' },
  { file: 'memberships/renewals/route.ts', expectedMethods: ['GET'], frontendUse: 'renewals tab' },

  { file: 'membership-plans/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create' },
  { file: 'membership-plans/[id]/route.ts', expectedMethods: ['GET', 'PATCH', 'DELETE'], frontendUse: 'detail + edit + archive' },

  { file: 'checkins/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + manual check-in' },
  { file: 'checkins/by-code/route.ts', expectedMethods: ['POST'], frontendUse: 'QR code check-in' },

  { file: 'billing/invoices/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create' },
  { file: 'billing/invoices/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + edit' },
  { file: 'billing/invoices/[id]/void/route.ts', expectedMethods: ['POST'], frontendUse: 'void invoice' },
  { file: 'billing/invoices/[id]/write-off/route.ts', expectedMethods: ['POST'], frontendUse: 'write-off invoice' },
  { file: 'billing/invoices/[id]/payment-link/route.ts', expectedMethods: ['POST'], frontendUse: 'payment link' },
  { file: 'billing/invoices/[id]/html/route.ts', expectedMethods: ['GET'], frontendUse: 'download invoice' },
  { file: 'billing/process/route.ts', expectedMethods: ['POST'], frontendUse: 'process billing' },
  { file: 'billing/reconciliation/route.ts', expectedMethods: ['GET'], frontendUse: 'reconciliation tab' },
  { file: 'billing/salary-window/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'salary window tab + save' },
  { file: 'billing/schedule/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'schedule tab' },

  { file: 'classes/types/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create class types' },
  { file: 'classes/types/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + edit class type' },
  { file: 'classes/sessions/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create sessions' },
  { file: 'classes/sessions/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + reschedule' },
  { file: 'classes/sessions/[id]/cancel/route.ts', expectedMethods: ['POST'], frontendUse: 'cancel session' },
  { file: 'classes/recurrences/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create recurrences' },
  { file: 'classes/recurrences/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + edit recurrence' },
  { file: 'classes/bookings/route.ts', expectedMethods: ['POST'], frontendUse: 'create bookings (GET handled by memberId param)' },
  { file: 'classes/bookings/[id]/cancel/route.ts', expectedMethods: ['POST'], frontendUse: 'cancel booking' },
  { file: 'classes/bookings/[id]/check-in/route.ts', expectedMethods: ['POST'], frontendUse: 'check-in booking' },

  { file: 'staff/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create staff' },
  { file: 'staff/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + update staff' },
  { file: 'staff/[id]/reactivate/route.ts', expectedMethods: ['POST'], frontendUse: 'reactivate staff' },

  { file: 'pos/sales/route.ts', expectedMethods: ['GET', 'POST'], frontendUse: 'list + create sale' },
  { file: 'pos/sales/[id]/route.ts', expectedMethods: ['GET'], frontendUse: 'sale detail' },
  { file: 'pos/sales/[id]/pay/route.ts', expectedMethods: ['POST'], frontendUse: 'pay sale' },
  { file: 'pos/sales/[id]/refund/route.ts', expectedMethods: ['POST'], frontendUse: 'refund sale' },
  { file: 'pos/sales/reports/daily/route.ts', expectedMethods: ['GET'], frontendUse: 'daily report' },

  { file: 'shop/products/route.ts', expectedMethods: ['GET'], frontendUse: 'list products' },
  { file: 'shop/products/[id]/route.ts', expectedMethods: ['GET', 'PATCH'], frontendUse: 'detail + update product' },

  { file: 'importer/members/preview/route.ts', expectedMethods: ['POST'], frontendUse: 'CSV preview' },
  { file: 'importer/members/apply/route.ts', expectedMethods: ['POST'], frontendUse: 'CSV apply' },

  { file: 'stats/overview/route.ts', expectedMethods: ['GET'], frontendUse: 'dashboard overview' },

  { file: 'whatsapp/messages/route.ts', expectedMethods: ['GET'], frontendUse: 'list messages' },
  { file: 'whatsapp/messages/send/route.ts', expectedMethods: ['POST'], frontendUse: 'send message' },
  { file: 'whatsapp/messages/[id]/resend/route.ts', expectedMethods: ['POST'], frontendUse: 'resend message' },
  { file: 'whatsapp/messages/broadcast/route.ts', expectedMethods: ['POST'], frontendUse: 'broadcast message' },
];

function findAllRouteFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'health') {
        files.push(...findAllRouteFiles(full));
      } else if (entry.name === 'route.ts') {
        files.push(full);
      }
    }
  } catch { /* dir may not exist yet */ }
  return files;
}

function getExportedMethods(routePath: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  try {
    const content = readFileSync(routePath, 'utf-8');
    for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as HttpMethod[]) {
      if (new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(content)) {
        methods.push(m);
      }
    }
  } catch { /* file doesn't exist */ }
  return methods;
}

describe('API Route Method Verification', () => {
  it('every expected route file exists', () => {
    for (const exp of EXPECTATIONS) {
      const fullPath = path.join(API_DIR, exp.file);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  for (const exp of EXPECTATIONS) {
    it(`${exp.file} exports [${exp.expectedMethods.join(', ')}] for: ${exp.frontendUse}`, () => {
      const fullPath = path.join(API_DIR, exp.file);
      const actual = getExportedMethods(fullPath);

      for (const m of exp.expectedMethods) {
        if (!actual.includes(m)) {
          // This is the bug we're catching
          throw new Error(
            `MISSING ${m} export in ${exp.file}\n` +
            `Frontend calls: ${exp.frontendUse}\n` +
            `Expected: [${exp.expectedMethods.join(', ')}]\n` +
            `Actual: [${actual.join(', ')}]\n` +
            `Next.js will return 405 Method Not Allowed when the frontend sends ${m}.`,
          );
        }
      }
    });
  }

  it('no route file is missing from our expectations list', () => {
    const allFiles = findAllRouteFiles(API_DIR);
    const expectedFiles = EXPECTATIONS.map(e => path.join(API_DIR, e.file));

    for (const f of allFiles) {
      if (!expectedFiles.includes(f)) {
        throw new Error(
          `Route file ${path.relative(API_DIR, f)} is not in the expectations list.\n` +
          `Add it to EXPECTATIONS with the HTTP methods the frontend uses.`,
        );
      }
    }
  });
});

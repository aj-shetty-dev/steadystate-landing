// Tiny templated message renderer. EN + AR locales supported.
// Meta-approved template names will land in Phase 7.
export interface ChurnNudgeContext {
  firstName: string;
  daysSinceLastCheckin: number;
  locale?: 'en' | 'ar';
}

export function renderChurnNudgeBody(ctx: ChurnNudgeContext): string {
  const name = ctx.firstName.trim() || (ctx.locale === 'ar' ? 'صديقي' : 'there');
  if (ctx.locale === 'ar') {
    return (
      `مرحباً ${name}، اشتقنا لرؤيتك في النادي منذ ${ctx.daysSinceLastCheckin} أيام. ` +
      `رد بـ "نعم" وسنساعدك في حجز جلستك القادمة.`
    );
  }
  return (
    `Hi ${name}, we've missed you at the studio for ${ctx.daysSinceLastCheckin} days. ` +
    `Reply YES and we'll help you book your next session.`
  );
}

export function firstNameFromFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const [first] = trimmed.split(/\s+/);
  return first ?? '';
}

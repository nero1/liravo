/**
 * Email service using Mailgun.
 *
 * Policy (per PRD §7.11 and §23):
 * - Free tier users: ONLY account-critical transactional emails:
 *     email verification links, account recovery links, 2FA recovery codes.
 * - Paid tier users: opt-in weekly digest, new release alerts, challenge reminders.
 * - NEVER send marketing email to free users.
 * - Every email includes a one-click unsubscribe link.
 * - Use sparingly — only when the user has opted in or when account safety requires it.
 */

import FormData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(FormData);

function getClient() {
  const apiKey = process.env.MAILGUN_API_KEY;
  if (!apiKey) throw new Error('MAILGUN_API_KEY is not configured');
  return mailgun.client({ username: 'api', key: apiKey });
}

const DOMAIN = process.env.MAILGUN_DOMAIN ?? '';
const FROM = process.env.MAILGUN_FROM ?? `Liravo <noreply@${DOMAIN}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

export type EmailType =
  // Transactional — sent to free + paid users when they explicitly add an email
  | 'email_verification'
  | 'account_recovery'
  | 'two_fa_recovery_codes'
  // Paid-tier only — digest / notifications
  | 'weekly_digest'
  | 'new_release_alert'
  | 'challenge_reminder';

/** Transactional types that are always permitted regardless of tier */
const TRANSACTIONAL_TYPES = new Set<EmailType>([
  'email_verification',
  'account_recovery',
  'two_fa_recovery_codes',
]);

export interface SendEmailOptions {
  to: string;
  type: EmailType;
  /** Whether the recipient is a paid subscriber */
  isPaidUser: boolean;
  subject: string;
  html: string;
  text: string;
  /** Optional: for digest unsubscribe token */
  unsubscribeToken?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const { to, type, isPaidUser, subject, html, text, unsubscribeToken } = opts;

  // Tier gate: non-transactional emails only go to paid users
  if (!TRANSACTIONAL_TYPES.has(type) && !isPaidUser) {
    return { ok: false, error: 'Email suppressed: free tier user' };
  }

  if (!DOMAIN) {
    console.warn('[email] MAILGUN_DOMAIN not set — email suppressed in dev');
    return { ok: false, error: 'MAILGUN_DOMAIN not configured' };
  }

  const unsubscribeUrl = unsubscribeToken
    ? `${APP_URL}/api/users/unsubscribe?token=${unsubscribeToken}`
    : `${APP_URL}/settings/notifications`;

  const htmlWithFooter = `${html}
<br/><hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0"/>
<p style="font-size:12px;color:#888;text-align:center">
  <a href="${unsubscribeUrl}" style="color:#888">Unsubscribe</a> &middot; Liravo &middot; liravo.org
</p>`;

  try {
    const client = getClient();
    const response = await client.messages.create(DOMAIN, {
      from: FROM,
      to: [to],
      subject,
      html: htmlWithFooter,
      text,
    });
    return { ok: true, messageId: response.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Mailgun error';
    console.error('[email] send failed', { type, error: message });
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

export function buildVerificationEmail(displayName: string, verificationUrl: string) {
  return {
    subject: 'Verify your email — Liravo',
    html: `<p>Hi ${displayName},</p>
<p>Click the button below to verify your email address. This link expires in 24 hours.</p>
<p><a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p>
<p>If you didn't add this email to your Liravo account, you can safely ignore this message.</p>`,
    text: `Hi ${displayName},\n\nVerify your email address:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't add this email to Liravo, ignore this message.`,
  };
}

export function buildRecoveryEmail(displayName: string, recoveryUrl: string) {
  return {
    subject: 'Account recovery — Liravo',
    html: `<p>Hi ${displayName},</p>
<p>We received a request to recover access to your Liravo account. Click the button below to continue. This link expires in 1 hour.</p>
<p><a href="${recoveryUrl}" style="display:inline-block;padding:12px 24px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Recover my account</a></p>
<p>If you didn't request this, you can safely ignore it.</p>`,
    text: `Hi ${displayName},\n\nRecover your Liravo account:\n${recoveryUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this message.`,
  };
}

export function buildTwoFARecoveryCodesEmail(displayName: string, codes: string[]) {
  const codeList = codes.map((c) => `  ${c}`).join('\n');
  return {
    subject: 'Your 2FA recovery codes — Liravo',
    html: `<p>Hi ${displayName},</p>
<p>Here are your single-use 2FA recovery codes. Store them somewhere safe. Each code can only be used once.</p>
<pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-family:monospace;font-size:14px">${codes.join('\n')}</pre>
<p><strong>Do not share these codes with anyone.</strong></p>`,
    text: `Hi ${displayName},\n\nYour 2FA recovery codes (each is single-use):\n\n${codeList}\n\nDo not share these codes.`,
  };
}

export function buildWeeklyDigestEmail(
  displayName: string,
  username: string,
  stats: { newFollowers: number; newNotifications: number; booksThisWeek: number }
) {
  return {
    subject: `Your Liravo week, ${displayName}`,
    html: `<p>Hi ${displayName},</p>
<p>Here's what happened on your Liravo account this week:</p>
<ul>
  <li><strong>${stats.newFollowers}</strong> new follower${stats.newFollowers !== 1 ? 's' : ''}</li>
  <li><strong>${stats.newNotifications}</strong> new notification${stats.newNotifications !== 1 ? 's' : ''}</li>
  <li><strong>${stats.booksThisWeek}</strong> book${stats.booksThisWeek !== 1 ? 's' : ''} tracked this week</li>
</ul>
<p><a href="${APP_URL}/feed" style="display:inline-block;padding:10px 20px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">View your feed</a></p>`,
    text: `Hi ${displayName},\n\nYour Liravo week:\n- ${stats.newFollowers} new followers\n- ${stats.newNotifications} new notifications\n- ${stats.booksThisWeek} books tracked\n\nView your feed: ${APP_URL}/feed\n\nProfile: ${APP_URL}/${username}`,
  };
}

export function buildNewReleaseEmail(
  displayName: string,
  authorName: string,
  bookTitle: string,
  bookUrl: string
) {
  return {
    subject: `New release from ${authorName} — Liravo`,
    html: `<p>Hi ${displayName},</p>
<p><strong>${authorName}</strong>, an author you follow on Liravo, just announced a new release:</p>
<p style="font-size:18px;font-weight:600">${bookTitle}</p>
<p><a href="${bookUrl}" style="display:inline-block;padding:10px 20px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">View on Liravo</a></p>`,
    text: `Hi ${displayName},\n\n${authorName} has a new release: ${bookTitle}\n\nView it: ${bookUrl}`,
  };
}

export function buildChallengeReminderEmail(
  displayName: string,
  challengeName: string,
  daysLeft: number,
  challengeUrl: string
) {
  return {
    subject: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in "${challengeName}" — Liravo`,
    html: `<p>Hi ${displayName},</p>
<p>You have <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</strong> to complete <strong>${challengeName}</strong>.</p>
<p><a href="${challengeUrl}" style="display:inline-block;padding:10px 20px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Continue challenge</a></p>`,
    text: `Hi ${displayName},\n\n${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in "${challengeName}".\n\nContinue: ${challengeUrl}`,
  };
}

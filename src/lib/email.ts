/**
 * Email service using Mailgun.
 *
 * Policy (per PRD §7.11 and §23):
 * - Free tier users: ONLY account-critical transactional emails:
 *     email verification links, account recovery links, 2FA recovery codes.
 * - Paid tier users: opt-in weekly digest, new release alerts, challenge reminders.
 * - NEVER send marketing email to free users.
 * - Every email includes notification settings or an unsubscribe link.
 * - Use sparingly — only when the user has opted in or when account safety requires it.
 */

import FormData from 'form-data';
import {createTranslator} from 'next-intl';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(FormData);

function getClient() {
  const apiKey = process.env.MAILGUN_API_KEY;
  if (!apiKey) throw new Error('MAILGUN_API_KEY is not configured');
  return mailgun.client({ username: 'api', key: apiKey, timeout: 6000 });
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
  /** Optional recipient opt-out token */
  unsubscribeToken?: string;
  locale?:string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  ambiguous?: boolean;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const {to,type,isPaidUser,subject,html,text,unsubscribeToken}=opts,locale=emailLocale(opts.locale),t=emailTranslator(locale);

  // Tier gate: non-transactional emails only go to paid users
  if (!TRANSACTIONAL_TYPES.has(type) && !isPaidUser) {
    return { ok: false, error: 'Email suppressed: free tier user' };
  }

  if(!TRANSACTIONAL_TYPES.has(type)&&!unsubscribeToken)return{ok:false,error:'Email suppressed: unsubscribe token required'};

  if (!DOMAIN) {
    console.warn('[email] MAILGUN_DOMAIN not set — email suppressed in dev');
    return { ok: false, error: 'MAILGUN_DOMAIN not configured' };
  }

  const unsubscribeUrl=unsubscribeToken?`${APP_URL}/email/unsubscribe?lang=${locale}#token=${encodeURIComponent(unsubscribeToken)}`:`${APP_URL}/settings/notifications`;
  const oneClickUrl=unsubscribeToken?`${APP_URL}/api/users/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`:null;

  const footer=t(unsubscribeToken?'footerUnsubscribe':'footerManage');
  const htmlWithFooter=`<!doctype html><html lang="${locale}"><body>${html}
<br/><hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0"/>
<p style="font-size:12px;color:#888;text-align:center"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#888">${escapeHtml(footer)}</a> &middot; Liravo &middot; liravo.org</p></body></html>`;
  const textWithFooter=text+'\n\n'+footer+': '+unsubscribeUrl+'\nLiravo';

  try {
    const client = getClient();
    const response = await client.messages.create(DOMAIN, {
      from: FROM,
      to: [to],
      subject,
      html: htmlWithFooter,
      text:textWithFooter,
      ...(oneClickUrl?{'h:List-Unsubscribe':'<'+oneClickUrl+'>','h:List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}:{}),
    });
    return { ok: true, messageId: response.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Mailgun error';
    console.error('[email] send failed', { type, error: message });
    const status = Number((err as { status?: number }).status);
    return { ok: false, error: message, ambiguous: !Number.isFinite(status) || status >= 500 };
  }
}

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
export function emailLocale(value:unknown){return value==='fr'||value==='de'?value:'en';}
function emailTranslator(locale:string){const selected=emailLocale(locale);return createTranslator({locale:selected,messages:{emails:{en:en.emails,fr:fr.emails,de:de.emails}[selected]},namespace:'emails'});}
const paragraph=(text:string)=>'<p>'+escapeHtml(text)+'</p>';
const button=(url:string,label:string)=>`<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;

export function buildVerificationEmail(displayName:string,verificationUrl:string,language='en'){
  const locale=emailLocale(language),t=emailTranslator(locale),greeting=t('greeting',{name:displayName.trim()?displayName:t('reader')});
  return{locale,subject:t('verifySubject'),html:paragraph(greeting)+paragraph(t('verifyBody'))+button(verificationUrl,t('verifyAction'))+paragraph(t('verifyIgnore')),text:[greeting,t('verifyBody'),t('verifyAction')+':\n'+verificationUrl,t('verifyIgnore')].join('\n\n')};
}
export function buildRecoveryEmail(displayName:string,recoveryUrl:string,language='en'){
  const locale=emailLocale(language),t=emailTranslator(locale),greeting=t('greeting',{name:displayName.trim()?displayName:t('reader')});
  return{locale,subject:t('recoverySubject'),html:paragraph(greeting)+paragraph(t('recoveryBody'))+button(recoveryUrl,t('recoveryAction'))+paragraph(t('recoveryIgnore')),text:[greeting,t('recoveryBody'),t('recoveryAction')+':\n'+recoveryUrl,t('recoveryIgnore')].join('\n\n')};
}
export function buildTwoFARecoveryCodesEmail(displayName:string,codes:string[],language='en'){
  const locale=emailLocale(language),t=emailTranslator(locale),greeting=t('greeting',{name:displayName.trim()?displayName:t('reader')});
  return{locale,subject:t('codesSubject'),html:paragraph(greeting)+paragraph(t('codesBody'))+`<pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-family:monospace;font-size:14px">${codes.map(escapeHtml).join('\n')}</pre>`+paragraph(t('codesWarning')),text:[greeting,t('codesBody'),codes.join('\n'),t('codesWarning')].join('\n\n')};
}
export function buildWeeklyDigestEmail(displayName:string,username:string,stats:{newFollowers:number;newNotifications:number;booksThisWeek:number},language='en'){
  const locale=emailLocale(language),t=emailTranslator(locale),greeting=t('greeting',{name:displayName.trim()?displayName:t('reader')}),items=[t('digestFollowers',{count:stats.newFollowers}),t('digestNotifications',{count:stats.newNotifications}),t('digestBooks',{count:stats.booksThisWeek})],url=APP_URL+'/feed';
  return{locale,subject:t('digestSubject',{name:displayName.trim()?displayName:t('reader')}),html:paragraph(greeting)+paragraph(t('digestBody'))+'<ul>'+items.map(item=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul>'+button(url,t('digestAction')),text:[greeting,t('digestBody'),items.map(item=>'- '+item).join('\n'),t('digestAction')+': '+url,t('profile')+': '+APP_URL+'/user/'+encodeURIComponent(username)].join('\n\n')};
}
export function buildNewReleaseEmail(displayName:string,authorName:string,bookTitle:string,bookUrl:string,language='en'){
  const locale=emailLocale(language),t=emailTranslator(locale),greeting=t('greeting',{name:displayName.trim()?displayName:t('reader')});
  return{locale,subject:t('releaseSubject',{author:authorName}),html:paragraph(greeting)+paragraph(t('releaseBody',{author:authorName}))+paragraph(bookTitle)+button(bookUrl,t('releaseAction')),text:[greeting,t('releaseBody',{author:authorName}),bookTitle,t('releaseAction')+': '+bookUrl].join('\n\n')};
}
export function buildChallengeReminderEmail(displayName:string,challengeName:string,daysLeft:number,challengeUrl:string,language='en'){
  const locale=emailLocale(language),t=emailTranslator(locale),greeting=t('greeting',{name:displayName.trim()?displayName:t('reader')});
  return{locale,subject:t('challengeSubject',{days:daysLeft,challenge:challengeName}),html:paragraph(greeting)+paragraph(t('challengeBody',{days:daysLeft,challenge:challengeName}))+button(challengeUrl,t('challengeAction')),text:[greeting,t('challengeBody',{days:daysLeft,challenge:challengeName}),t('challengeAction')+': '+challengeUrl].join('\n\n')};
}

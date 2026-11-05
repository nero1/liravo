import {cron} from '@/lib/cron';
import {NextResponse} from 'next/server';
import {processPaidEmails} from '@/lib/paid-email';
export const dynamic='force-dynamic';
async function run(){const result=await processPaidEmails('weekly_digest');return NextResponse.json(result,{status:result.failed||result.unknown?503:200});}
export const GET=cron('email-digest',run);
export const POST=GET;
export const maxDuration=60;

import {NextResponse} from 'next/server';
import {getFeatureFlags} from '@/lib/feature-flags';
export const dynamic='force-dynamic';
export async function GET(){const flags=await getFeatureFlags();return NextResponse.json({google:flags.google_auth===true,telegram:flags.telegram_auth===true},{headers:{'Cache-Control':'no-store'}});}

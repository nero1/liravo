import {NextResponse} from 'next/server';
import {authChallengeConfig} from '@/lib/auth/challenges';
import {isDirectPostgres} from '@/lib/db/provider';

export const dynamic='force-dynamic';
export function GET(){return NextResponse.json(isDirectPostgres()?authChallengeConfig():{enabled:false,siteKey:null},{headers:{'Cache-Control':'no-store'}});}

import { cron } from '@/lib/cron';
import { refreshAIProfiles } from '@/lib/ai-profile-batch';
export const dynamic='force-dynamic';
export const GET=cron('taste-profiles',()=>refreshAIProfiles('taste'));
export const POST=GET;
export const maxDuration=60;

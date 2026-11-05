import {validProofUrl} from '@/lib/content-form-values';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const schema = z.object({
  pen_name: z.string().trim().min(1).max(100),
  publisher: z.string().trim().max(200).optional(),
  book_titles: z.string().trim().min(1).max(2000),
  website_url: z.string().trim().url().refine(validProofUrl).optional().or(z.literal('')),
  social_proof_url: z.string().trim().url().refine(validProofUrl).optional().or(z.literal('')),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(()=>null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let verification;
  try {
    const intent=await contentIntent(req,user.id,'author_verification_requests',{
      user_id: user.id,
      pen_name: parsed.data.pen_name,
      publisher: parsed.data.publisher ?? null,
      book_titles: parsed.data.book_titles,
      website_url: parsed.data.website_url || null,
      social_proof_url: parsed.data.social_proof_url || null,
      status: 'pending',
    });
    verification=await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ message: 'Verification request submitted',request:verification,actorId:user.id }, { status: 201 });
}

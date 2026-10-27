import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getStorageProvider } from '@/lib/storage/provider';
import { isDirectPostgres } from '@/lib/db/provider';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Avatar must be under 5MB' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `avatars/${user.id}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'image/jpeg';

  let publicUrl: string;

  if (isDirectPostgres()) {
    const storage = getStorageProvider();
    const bucket = process.env.S3_BUCKET ?? 'avatars';
    const { data, error } = await storage.upload(bucket, path, body, { contentType, upsert: true });
    if (error || !data) {
      return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
    }
    publicUrl = storage.getPublicUrl(bucket, path);
  } else {
    // Supabase mode — use Supabase storage directly from server
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from('avatars')
      .upload(path, body, { upsert: true, contentType });
    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
    }
    const { data: { publicUrl: sbUrl } } = service.storage.from('avatars').getPublicUrl(path);
    publicUrl = sbUrl;
  }

  const service = createServiceClient();
  const { error: updateError } = await service
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  return NextResponse.json({ publicUrl });
}

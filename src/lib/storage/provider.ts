import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

export interface StorageProvider {
  upload(
    bucket: string,
    path: string,
    body: Buffer,
    opts?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;

  remove(
    bucket: string,
    paths: string[]
  ): Promise<{ error: { message: string } | null }>;

  getPublicUrl(bucket: string, path: string): string;
}

// ---- Supabase storage adapter ----

function createSupabaseStorageAdapter(supabaseStorageFrom: (bucket: string) => {
  upload: (path: string, body: Blob | Buffer, opts?: { upsert?: boolean; contentType?: string }) => Promise<{ error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
}): StorageProvider {
  return {
    async upload(bucket, path, body, opts) {
      const { error } = await supabaseStorageFrom(bucket).upload(path, body, {
        upsert: opts?.upsert,
        contentType: opts?.contentType,
      });
      if (error) return { data: null, error: { message: String((error as { message?: string }).message ?? error) } };
      return { data: { path }, error: null };
    },

    async remove(bucket, paths) {
      const { error } = await supabaseStorageFrom(bucket).remove(paths);
      if (error) return { error: { message: String((error as { message?: string }).message ?? error) } };
      return { error: null };
    },

    getPublicUrl(bucket, path) {
      const { data } = supabaseStorageFrom(bucket).getPublicUrl(path);
      return data.publicUrl;
    },
  };
}

// ---- S3-compatible storage adapter (Cloudflare R2, B2, DO Spaces, AWS S3) ----

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? 'auto';
  const key = process.env.S3_KEY;
  const secret = process.env.S3_SECRET;

  if (!endpoint || !key || !secret) {
    throw new Error('S3_ENDPOINT, S3_KEY, and S3_SECRET are required when DATABASE_PROVIDER=digitalocean');
  }

  _s3Client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });

  return _s3Client;
}

function createS3StorageAdapter(): StorageProvider {
  return {
    async upload(bucket, path, body, opts) {
      try {
        const client = getS3Client();
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: path,
            Body: body,
            ContentType: opts?.contentType ?? 'application/octet-stream',
            ACL: 'public-read',
          })
        );
        return { data: { path }, error: null };
      } catch (err) {
        return { data: null, error: { message: String(err) } };
      }
    },

    async remove(bucket, paths) {
      try {
        const client = getS3Client();
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: paths.map((Key) => ({ Key })),
              Quiet: true,
            },
          })
        );
        return { error: null };
      } catch (err) {
        return { error: { message: String(err) } };
      }
    },

    getPublicUrl(_bucket, path) {
      const cdnUrl = process.env.S3_CDN_URL ?? '';
      return `${cdnUrl.replace(/\/$/, '')}/${path}`;
    },
  };
}

// ---- Factory ----

let _storageProvider: StorageProvider | null = null;

export function getStorageProvider(
  supabaseStorageFrom?: (bucket: string) => {
    upload: (path: string, body: Blob | Buffer, opts?: { upsert?: boolean; contentType?: string }) => Promise<{ error: unknown }>;
    remove: (paths: string[]) => Promise<{ error: unknown }>;
    getPublicUrl: (path: string) => { data: { publicUrl: string } };
  }
): StorageProvider {
  const provider = process.env.DATABASE_PROVIDER ?? 'supabase';

  if (provider === 'digitalocean') {
    if (!_storageProvider) _storageProvider = createS3StorageAdapter();
    return _storageProvider;
  }

  // Supabase mode — adapter wraps the passed-in Supabase storage client
  if (!supabaseStorageFrom) {
    throw new Error('supabaseStorageFrom is required in Supabase storage mode');
  }
  return createSupabaseStorageAdapter(supabaseStorageFrom);
}

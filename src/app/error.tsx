'use client';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isConfigError =
    error.message.includes('Supabase is not configured') ||
    error.message.includes('NEXT_PUBLIC_SUPABASE_URL');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        {isConfigError ? 'Setup Required' : 'Something went wrong'}
      </h1>
      {isConfigError ? (
        <p style={{ color: '#666' }}>
          Environment variables are not configured. Add{' '}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your <code>.env.local</code> file.
        </p>
      ) : (
        <>
          <p style={{ color: '#666', marginBottom: '1rem' }}>{error.message}</p>
          <button onClick={reset} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

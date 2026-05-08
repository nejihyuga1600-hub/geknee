import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { mintHandoff } from '@/lib/handoff-token';

export const dynamic = 'force-dynamic';

export default async function NativeHandoffPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const email = session?.user?.email;

  if (!userId || !email) {
    redirect('/?signin=1&error=handoff_no_session');
  }

  const token = await mintHandoff({ userId, email });
  const deepLink = `geknee://auth?t=${encodeURIComponent(token)}`;

  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${deepLink}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(deepLink)});`,
        }}
      />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f5f1e8', color: '#111',
        fontFamily: '-apple-system, system-ui, sans-serif',
        padding: 24,
      }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
            Signed in. Returning to geknee…
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#555', margin: '0 0 20px' }}>
            If you aren&apos;t bounced back automatically, tap below.
          </p>
          <a
            href={deepLink}
            style={{
              display: 'inline-block', background: '#111', color: '#fff',
              padding: '12px 20px', borderRadius: 999, textDecoration: 'none',
              fontWeight: 500, fontSize: 15,
            }}
          >
            Open geknee app
          </a>
        </div>
      </div>
    </>
  );
}

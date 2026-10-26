import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Liravo — Discover books through people you trust';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', background: '#0f0f0f', color: '#ffffff', padding: 80 }}>
      <div style={{ fontSize: 96, color: '#f59e0b' }}>Liravo</div>
      <div style={{ fontSize: 40, marginTop: 24 }}>Discover books through people you trust.</div>
    </div>,
    size
  );
}

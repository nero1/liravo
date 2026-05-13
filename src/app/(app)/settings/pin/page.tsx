import type { Metadata } from 'next';
import PINSettingsClient from './PINSettingsClient';

export const metadata: Metadata = { title: 'Set PIN' };

export default function PINSettingsPage() {
  return <PINSettingsClient />;
}

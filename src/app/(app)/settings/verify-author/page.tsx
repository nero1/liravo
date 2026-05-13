import type { Metadata } from 'next';
import VerifyAuthorClient from './VerifyAuthorClient';

export const metadata: Metadata = { title: 'Request Author Verification' };

export default function VerifyAuthorPage() {
  return <VerifyAuthorClient />;
}

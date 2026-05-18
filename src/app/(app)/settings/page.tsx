import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Mail, Lock, Upload, AlertTriangle, FileText, ShieldCheck, Download } from 'lucide-react';
import { SettingsDataActions } from './SettingsDataActions';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const settingsLinks = [
    { href: '/settings/email', icon: Mail, label: 'Email Recovery', desc: 'Add email for account recovery' },
    { href: '/settings/pin', icon: Lock, label: '4-Digit PIN', desc: 'Extra security for sensitive actions' },
    { href: '/settings/2fa', icon: ShieldCheck, label: 'Two-Factor Auth', desc: 'Authenticator app (no SMS)' },
    { href: '/settings/import', icon: Upload, label: 'Import Books', desc: 'Import from Goodreads CSV' },
    { href: '/settings/verify-author', icon: FileText, label: 'Author Verification', desc: 'Apply for verified author status' },
    { href: '/settings/appeal', icon: AlertTriangle, label: 'Appeal a Decision', desc: 'Contest a moderation action' },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-2">
        {settingsLinks.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <Icon size={18} className="text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Data and account actions */}
      <div className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Data &amp; Privacy</h2>
        <div className="space-y-2">
          <a
            href="/api/users/export"
            download
            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download size={18} className="text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Export My Data (JSON)</p>
                <p className="text-xs text-muted-foreground">Download your full reading history, reviews, and quotes</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </a>
          <a
            href="/api/users/export?format=csv"
            download
            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download size={18} className="text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Export Reading History (CSV)</p>
                <p className="text-xs text-muted-foreground">Goodreads-compatible CSV of your shelf</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </a>
        </div>
        <SettingsDataActions />
      </div>
    </div>
  );
}

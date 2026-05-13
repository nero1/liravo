import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Mail, Lock, Upload, AlertTriangle, FileText } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const settingsLinks = [
    { href: '/settings/email', icon: Mail, label: 'Email Recovery', desc: 'Add email for account recovery' },
    { href: '/settings/pin', icon: Lock, label: '4-Digit PIN', desc: 'Extra security for sensitive actions' },
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
    </div>
  );
}

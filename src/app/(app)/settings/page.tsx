import {getTranslations} from 'next-intl/server';
import {languageAlternates} from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Mail, Lock, Upload, AlertTriangle, FileText, ShieldCheck, Bell } from 'lucide-react';
import {SettingsExportButton} from './SettingsExportButton';
import { SettingsDataActions } from './SettingsDataActions';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('nativeNavigation');return {title:t('settings'),alternates:languageAlternates('/settings')};}

export default async function SettingsPage() {
  const [t,nav,data,labels]=await Promise.all([getTranslations('settings'),getTranslations('nativeNavigation'),getTranslations('accountData'),getTranslations('nav')]);
  const supabase = (await createClient());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const settingsLinks = [
    { href: '/settings/notifications', icon: Bell, label: labels('notifications'), desc: t('notificationsDescription') },
    { href: '/settings/email', icon: Mail, label: t('recovery'), desc: t('recoveryDescription') },
    { href: '/settings/pin', icon: Lock, label: t('pin'), desc: t('pinDescription') },
    { href: '/settings/2fa', icon: ShieldCheck, label: t('twoFactor'), desc: t('twoFactorDescription') },
    { href: '/settings/import', icon: Upload, label: nav('importBooks'), desc: t('importDescription') },
    { href: '/settings/verify-author', icon: FileText, label: nav('verifyAuthor'), desc: t('verifyDescription') },
    { href: '/settings/appeal', icon: AlertTriangle, label: t('appeal'), desc: t('appealDescription') },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{nav('settings')}</h1>
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
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('dataPrivacy')}</h2>
        <div className="space-y-2">
          <SettingsExportButton actorId={user.id} format="json" label={t('exportJson')} description={data('exportDescription')}/>
          <SettingsExportButton actorId={user.id} format="csv" label={t('exportCsv')} description={t('csvDescription')}/>
        </div>
        <SettingsDataActions />
      </div>
    </div>
  );
}

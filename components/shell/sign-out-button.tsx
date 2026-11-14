'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';

export function SignOutButton() {
  const t = useTranslations('topbar');
  const router = useRouter();
  return (
    <Button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'mm' } });
        router.push('/login');
        router.refresh();
      }}
    >
      {t('signOut')}
    </Button>
  );
}

import { Slot } from 'expo-router';

import { AppShell } from '@/components/AppShell';

export default function SignedInLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}

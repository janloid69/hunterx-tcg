import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { canPromptInstall, installPlatform, isInstalled, onInstallChange, promptInstall } from '@/lib/pwa';
import { colors } from '@/lib/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { Surface } from './ui';

const STEPS = {
  ios: [
    'Tap Share. In Safari it’s at the bottom, or inside the ⋯ menu beside the address bar on newer iPhones. In Chrome it’s at the right of the address bar.',
    'Scroll down the list and tap “Add to Home Screen”.',
    'If you see “Open as Web App”, leave it on. Tap Add, then open HunterX from its new icon.',
  ],
  android: ['Tap ⋮ at the top right of Chrome.', 'Choose “Install app” or “Add to Home screen”.'],
  desktop: ['In Chrome or Edge, click the install icon at the right end of the address bar.'],
};

/** "Add HunterX to your home screen", with steps for the member's phone. Hidden once installed. */
export function InstallCard({ onDismiss, compact = false }: { onDismiss?: () => void; compact?: boolean }) {
  const [, rerender] = useState(0);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);
  if (isInstalled()) return null;

  const platform = installPlatform();
  if (compact && platform === 'desktop') return null;
  const canPrompt = canPromptInstall();

  return (
    <Surface style={{ gap: 10 }}>
      <View style={styles.top}>
        <Icon name="plus" size={20} color={colors.accent} strokeWidth={2.2} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          Add HunterX to your home screen
        </AppText>
        {onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Hide this" onPress={onDismiss} style={styles.close}>
            <Icon name="close" size={18} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
      <AppText variant="small">Opens full screen like an app, with its own icon. No app store needed.</AppText>
      {canPrompt ? (
        <Button label="Install HunterX" icon="plus" onPress={() => promptInstall()} />
      ) : (
        STEPS[platform].map((step, index) => (
          <AppText key={step} variant="small" color={colors.textSoft}>
            {index + 1}. {step}
          </AppText>
        ))
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

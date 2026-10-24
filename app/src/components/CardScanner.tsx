// Phone apps (later): the camera scanner is website-only for now, so this shows
// a short note. The website uses CardScanner.web.tsx.

import { View } from 'react-native';

import { colors } from '@/lib/theme';

import { AppText } from './AppText';

export type ScannerStatus =
  | 'starting'
  | 'loading-reader'
  | 'scanning'
  | 'paused'
  | 'denied'
  | 'no-camera'
  | 'no-match'
  | 'error';

export type CardScannerProps = {
  /** Camera on (the page is open). */
  enabled: boolean;
  /** Reading the guide box; turned off while a match is showing. */
  reading: boolean;
  height: number;
  /** Text read from the camera or a photo. Return true when it matched a card, to pause reading. */
  onText: (text: string) => Promise<boolean>;
  onStatus?: (status: ScannerStatus, detail?: string) => void;
};

export function CardScanner({ height }: CardScannerProps) {
  return (
    <View style={{ height, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <AppText variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
        Camera scanning works on the HunterX website for now. Type the card number below instead.
      </AppText>
    </View>
  );
}

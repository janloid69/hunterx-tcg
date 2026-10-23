export const colors = {
  bg: '#0E0E10',
  bgRaised: '#121215',
  surface: '#1A1A1E',
  surface2: '#1F1F24',
  surface3: '#26262C',
  border: '#2A2A31',
  borderStrong: '#3A3A42',
  divider: '#1E1E23',
  text: '#F5F3EE',
  textSoft: '#D6D4CE',
  textMuted: '#A3A1A8',
  textFaint: '#8E8C94',
  accent: '#FF6B1A',
  onAccent: '#0E0E10',
  discord: '#5865F2',
  discordSurface: '#17182A',
  discordBorder: '#2C2F55',
  discordText: '#B4B6CF',
  discordStrong: '#B9BEFF',
  discordIcon: '#8B93FF',
  up: '#5BD68A',
  down: '#FF8A80',
  gold: '#F2C94C',
  verifiedBg: '#2A2016',
  verifiedText: '#FFB27A',
  successBg: '#13281C',
  dangerBg: '#2B1716',
} as const;

export const fonts = {
  display: 'Anton_400Regular',
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  extrabold: 'Archivo_800ExtraBold',
} as const;

export const maxContentWidth = 1200;

/** Breakpoint where the layout switches from phone to computer navigation. */
export const wideBreakpoint = 900;

export type ArtPalette = { bg: string; edge: string; win: string; ac: string };

const palettes: Record<string, ArtPalette> = {
  pokemon: { bg: '#24210F', edge: '#3A3418', win: '#3B3519', ac: '#F2C94C' },
  'one-piece': { bg: '#271413', edge: '#40201E', win: '#43211F', ac: '#FF7A6B' },
  riftbound: { bg: '#11211F', edge: '#1D3A36', win: '#1F3E3A', ac: '#5ED6C4' },
  yugioh: { bg: '#121829', edge: '#1F2944', win: '#212C4A', ac: '#7FA6FF' },
  gundam: { bg: '#1A1626', edge: '#2C2540', win: '#2F2844', ac: '#B79CFF' },
  'final-fantasy': { bg: '#1B1A12', edge: '#2F2D1E', win: '#33311F', ac: '#E6D48A' },
  toys: { bg: '#181C1E', edge: '#2A3034', win: '#2C3337', ac: '#B8C4C9' },
};

export function paletteFor(gameId: string | null | undefined): ArtPalette {
  return (gameId && palettes[gameId]) || palettes.toys;
}

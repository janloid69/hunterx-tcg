import { useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, View, type TextStyle } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Surface } from '@/components/ui';
import type { CommunityDrop, DropAttachment } from '@/lib/community';
import { discordParts } from '@/lib/discordText';
import { timeAgo } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';

// Long links wrap instead of running off the card on the web.
const wrapAnywhere = (Platform.OS === 'web' ? { overflowWrap: 'anywhere' } : {}) as unknown as TextStyle;

/** Post text with tappable links and bold, like in Discord. */
export function DiscordText({ text }: { text: string }) {
  const parts = discordParts(text);
  if (parts.length === 0) return null;
  return (
    <AppText variant="body" color={colors.textSoft} style={wrapAnywhere}>
      {parts.map((part, index) =>
        part.kind === 'link' ? (
          <AppText
            key={index}
            accessibilityRole="link"
            variant="body"
            color={colors.accent}
            style={part.bold ? styles.bold : null}
            onPress={() => Linking.openURL(part.url)}
          >
            {part.text}
          </AppText>
        ) : (
          <AppText key={index} variant="body" color={part.bold ? colors.text : colors.textSoft} style={part.bold ? styles.bold : null}>
            {part.text}
          </AppText>
        ),
      )}
    </AppText>
  );
}

function DropImage({ attachment }: { attachment: DropAttachment }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const ratio =
    attachment.width && attachment.height ? Math.min(1.9, Math.max(0.6, attachment.width / attachment.height)) : 1;
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open the picture" onPress={() => Linking.openURL(attachment.url)}>
      <Image
        source={{ uri: attachment.url }}
        onError={() => setFailed(true)}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        style={[styles.image, { aspectRatio: ratio }]}
      />
    </Pressable>
  );
}

/** One post from #upcoming-drops. */
export function DropCard({ drop }: { drop: CommunityDrop }) {
  const images = drop.attachments.filter((attachment) => attachment.kind === 'image').slice(0, 2);
  const otherFiles = drop.attachments.length - images.length;
  return (
    <Surface style={styles.card}>
      <View style={styles.top}>
        <Avatar uri={drop.author_avatar} name={drop.author_name} seed={drop.author_name} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {drop.author_name}
          </AppText>
          <AppText variant="small">
            {timeAgo(drop.posted_at)}
            {drop.edited_at ? ' · edited' : ''}
          </AppText>
        </View>
      </View>

      {drop.reply ? (
        <View style={styles.reply}>
          <AppText variant="small" numberOfLines={2}>
            <AppText variant="smallStrong" color={colors.textSoft}>
              Replying to {drop.reply.author}:
            </AppText>{' '}
            {drop.reply.content}
          </AppText>
        </View>
      ) : null}

      <DiscordText text={drop.content} />

      {images.map((attachment) => (
        <DropImage key={attachment.url} attachment={attachment} />
      ))}
      {otherFiles > 0 ? (
        <AppText variant="small">
          + {otherFiles} more {otherFiles === 1 ? 'file' : 'files'} in Discord
        </AppText>
      ) : null}

      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(drop.url)} style={styles.open}>
        <AppText variant="smallStrong" color={colors.accent}>
          Open in Discord
        </AppText>
        <Icon name="external" size={14} color={colors.accent} />
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reply: { borderLeftWidth: 2, borderLeftColor: colors.borderStrong, paddingLeft: 10 },
  bold: { fontFamily: fonts.bold },
  image: { width: '100%', maxHeight: 360, borderRadius: 12, backgroundColor: colors.surface3 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
});

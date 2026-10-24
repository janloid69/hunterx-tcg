import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Screen, Surface } from '@/components/ui';
import { discordInviteUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const UPDATED = 'October 24, 2026';

const HOUSE_RULES = [
  'Selling is for members of the HunterX Discord. Buying and messaging are open to anyone signed in with Discord.',
  'Describe items honestly: the real condition, real photos of the item you have, and the price you’ll actually accept.',
  'No fakes, proxies or reprints sold as real. No items that are illegal or not allowed on HunterX (weapons, drugs, adult content, stolen goods, accounts or gift codes).',
  'Keep the deal in your HunterX chat. Moving to another app makes it hard for mods to help if something goes wrong.',
  'Mark a listing sold when it’s done, and only pick the member you actually sold to.',
  'Vouches and logged sales must come from real deals. Fake vouches, fake sales or bidding up your own items get you removed.',
  'Be decent. No harassment, threats, spam or begging for lower prices after a deal is agreed.',
];

const SAFETY = [
  'HunterX doesn’t hold money or ship items. Every deal is between the buyer and the seller.',
  'Check the seller’s vouches and Verified Seller badge before paying.',
  'Meet in a busy public place, like a mall, and check the item before you pay.',
  'For shipping, ask for a photo or video of the item with your name and today’s date. Sellers: wait until the money shows in your GCash, Maya or bank app, because screenshots can be faked.',
  'HunterX never asks for your password or a payment to “verify” your account.',
];

const MODS = [
  'Report a listing, member or message from its page. A mod looks at every report within 24 hours.',
  'Three reports from different members hide a listing until a mod reviews it.',
  'Mods can hide listings, remove fake sales and vouches, and remove members from the site or the Discord.',
];

const PRIVACY: { title: string; body: string }[] = [
  {
    title: 'What we keep',
    body:
      'From Discord: your user ID, username, display name, profile picture, email address (never shown to other members), and whether you’re in the HunterX server with the Verified Seller or Mod role. We never see your Discord password or your Discord messages. From you: your binder, listings and their photos, chats and offers, vouches, reports, and sales you log.',
  },
  {
    title: 'Who sees what',
    body:
      'Signed-in members can see your profile, listings and vouches. Your binder and its value are only for you. Chats are only between the buyer and the seller; mods see a message only if someone reports it. Reports are seen only by mods, and the person reported isn’t told who reported them. Logged sales show the price, condition and date, never who logged them.',
  },
  {
    title: 'Why',
    body:
      'Only to run HunterX: show your binder and listings, let members trade and message, keep the market safe, and build the peso price guide. We don’t sell your information and there are no ads.',
  },
  {
    title: 'Where it’s stored',
    body:
      'In our database on Supabase, with the website hosted on Netlify. The HunterX Discord bot uses the same database to post listings and vouches in the server and to send DMs.',
  },
  {
    title: 'Discord DMs',
    body: 'The bot DMs you about new messages, offers, finished deals and your reports. Turn this off any time on your Profile page.',
  },
  {
    title: 'Deleting your account',
    body:
      'Profile → Delete account removes your profile, binder, listings and photos, chats, vouches and blocks for good. Final sale prices stay in the price guide without your name.',
  },
  {
    title: 'Your rights',
    body:
      'Under the Philippine Data Privacy Act you can ask to see, correct or delete your information. Message a HunterX mod on Discord and we’ll sort it out.',
  },
];

export default function RulesScreen() {
  return (
    <Screen>
      <Pressable
        accessibilityRole="link"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.back}
      >
        <Icon name="chevronLeft" size={22} color={colors.text} strokeWidth={2} />
        <AppText variant="bodyStrong">Back</AppText>
      </Pressable>

      <AppText variant="displaySmall" accessibilityRole="header">
        HOUSE RULES & PRIVACY
      </AppText>
      <AppText variant="small">Last updated {UPDATED}</AppText>

      <Section title="House rules" items={HOUSE_RULES} />
      <Section title="Trading safely" items={SAFETY} />
      <Section title="Reports and mods" items={MODS} />

      <Surface style={{ gap: 14 }}>
        <AppText variant="heading">Privacy</AppText>
        {PRIVACY.map((part) => (
          <View key={part.title} style={{ gap: 4 }}>
            <AppText variant="bodyStrong">{part.title}</AppText>
            <AppText variant="body" color={colors.textSoft}>
              {part.body}
            </AppText>
          </View>
        ))}
      </Surface>

      <Surface style={{ gap: 10 }}>
        <AppText variant="bodyStrong">Questions?</AppText>
        <AppText variant="body" color={colors.textSoft}>
          Ask a mod in the HunterX Discord.
        </AppText>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(discordInviteUrl)} style={styles.link}>
          <AppText variant="smallStrong" color={colors.accent}>
            Open the HunterX Discord
          </AppText>
          <Icon name="external" size={16} color={colors.accent} />
        </Pressable>
      </Surface>

      <AppText variant="small" color={colors.textFaint}>
        HunterX TCG is a fan-run community site. It is not affiliated with The Pokémon Company, Bandai, Konami, Riot
        Games, Square Enix, Mattel or Takara Tomy.
      </AppText>
    </Screen>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <Surface style={{ gap: 10 }}>
      <AppText variant="heading">{title}</AppText>
      {items.map((item) => (
        <View key={item} style={styles.item}>
          <AppText variant="body" color={colors.accent}>
            •
          </AppText>
          <AppText variant="body" color={colors.textSoft} style={{ flex: 1 }}>
            {item}
          </AppText>
        </View>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  item: { flexDirection: 'row', gap: 10 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, alignSelf: 'flex-start' },
});

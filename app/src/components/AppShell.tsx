import { Link, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { colors, fonts, maxContentWidth, wideBreakpoint } from '@/lib/theme';
import { useUnreadCount } from '@/lib/useUnread';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Wordmark } from './Wordmark';

type NavItem = {
  href: '/' | '/binder' | '/scan' | '/market' | '/community';
  label: string;
  icon: IconName;
  isActive: (path: string) => boolean;
};

const NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: 'home', isActive: (p) => p === '/' },
  { href: '/binder', label: 'Binder', icon: 'binder', isActive: (p) => p.startsWith('/binder') },
  { href: '/scan', label: 'Scan', icon: 'scan', isActive: (p) => p.startsWith('/scan') },
  { href: '/market', label: 'Market', icon: 'market', isActive: (p) => p.startsWith('/market') },
  { href: '/community', label: 'Community', icon: 'community', isActive: (p) => p.startsWith('/community') },
];

/**
 * The frame around every signed-in page: a top bar on computers, and a
 * header plus bottom tab bar on phones.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const wide = width >= wideBreakpoint;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={[styles.headerInner, wide ? styles.headerWide : null]}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="HunterX TCG home">
              <Wordmark size={wide ? 26 : 28} />
            </Pressable>
          </Link>

          {wide ? (
            <View style={styles.topNav} accessibilityRole="menubar">
              {NAV.filter((item) => item.href !== '/scan').map((item) => {
                const active = item.isActive(pathname);
                return (
                  <Link key={item.href} href={item.href} asChild>
                    {/* Link with asChild passes style straight to the browser on the web,
                        so it must be one flat object, never an array. */}
                    <Pressable
                      accessibilityRole="link"
                      accessibilityState={{ selected: active }}
                      style={active ? styles.topLinkActive : styles.topLink}
                    >
                      <AppText
                        variant="bodyStrong"
                        color={active ? colors.text : colors.textMuted}
                        style={{ fontFamily: fonts.semibold }}
                      >
                        {item.label}
                      </AppText>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          ) : null}

          <View style={styles.headerActions}>
            {wide ? (
              <Link href="/scan" asChild>
                <Pressable accessibilityRole="link" style={styles.scanPill}>
                  <Icon name="scan" size={18} color={colors.onAccent} strokeWidth={2} />
                  <AppText variant="bodyStrong" color={colors.onAccent} style={{ fontFamily: fonts.extrabold, fontSize: 14 }}>
                    Scan a card
                  </AppText>
                </Pressable>
              </Link>
            ) : null}
            <MessagesButton />
            <Link href="/add" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="Add to binder" style={styles.iconButton}>
                <Icon name="plus" size={24} color={colors.accent} strokeWidth={2} />
              </Pressable>
            </Link>
            <ProfileButton />
          </View>
        </View>
      </View>

      <View style={styles.body}>{children}</View>

      {wide ? null : (
        <View
          accessibilityRole="tablist"
          style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}
        >
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            if (item.href === '/scan') {
              return (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable accessibilityRole="tab" accessibilityLabel="Scan a card" accessibilityState={{ selected: active }} style={styles.tab}>
                    <View style={styles.scanBubble}>
                      <Icon name="scan" size={28} color={colors.onAccent} strokeWidth={2} />
                    </View>
                    <AppText variant="smallStrong" color={colors.text} style={styles.tabLabel}>
                      Scan
                    </AppText>
                  </Pressable>
                </Link>
              );
            }
            return (
              <Link key={item.href} href={item.href} asChild>
                <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.tab}>
                  <Icon name={item.icon} size={24} color={active ? colors.accent : colors.textFaint} />
                  <AppText
                    variant="smallStrong"
                    color={active ? colors.accent : colors.textFaint}
                    style={styles.tabLabel}
                  >
                    {item.label}
                  </AppText>
                </Pressable>
              </Link>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MessagesButton() {
  const unread = useUnreadCount();
  return (
    <Link href="/messages" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
        style={styles.iconButton}
      >
        <Icon name="chat" size={23} color={colors.text} />
        {unread > 0 ? (
          <View style={styles.unreadBadge}>
            <AppText variant="smallStrong" color={colors.onAccent} style={{ fontSize: 10, lineHeight: 14 }}>
              {unread > 9 ? '9+' : unread}
            </AppText>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

function ProfileButton() {
  const { profile } = useAuth();
  return (
    <Link href="/profile" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel="Your profile" style={styles.iconButton}>
        <View style={styles.avatarRing}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} accessibilityIgnoresInvertColors />
          ) : (
            <Icon name="user" size={18} color={colors.text} />
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.bg },
  headerInner: {
    width: '100%',
    maxWidth: maxContentWidth + 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  headerWide: { paddingHorizontal: 24, paddingVertical: 12 },
  topNav: { flexDirection: 'row', gap: 4, flex: 1, marginLeft: 16 },
  topLink: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  topLinkActive: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scanPill: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 6,
  },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  unreadBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgRaised,
    borderTopWidth: 1,
    borderTopColor: '#24242A',
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  tabLabel: { fontSize: 11 },
  scanBubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.bg,
  },
});

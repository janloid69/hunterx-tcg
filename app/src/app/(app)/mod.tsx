import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/Chip';
import { Badge, Notice, Screen, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { REPORT_REASONS, getReports, setListingHidden, setReportStatus } from '@/lib/market';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Report } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

const reasonLabel = Object.fromEntries(REPORT_REASONS.map((reason) => [reason.value, reason.label]));

export default function ModScreen() {
  const { profile } = useAuth();
  const [view, setView] = useState<'open' | 'closed'>('open');
  const reports = useQuery(() => getReports(view), [view]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (profile && !profile.is_mod) {
    return (
      <Screen>
        <Notice tone="error">This page is for HunterX mods.</Notice>
      </Screen>
    );
  }

  async function act(report: Report, action: () => Promise<void>) {
    setBusyId(report.id);
    setError(null);
    try {
      await action();
      reports.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        REPORTS
      </AppText>
      <AppText variant="body" color={colors.textMuted}>
        Reply within 24 hours. Three reports from different members hide a listing automatically until you review it.
      </AppText>
      <ChipRow<'open' | 'closed'>
        accessibilityLabel="Show"
        options={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Handled' },
        ]}
        value={view}
        onChange={setView}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {reports.loading && !reports.data ? <ActivityIndicator color={colors.accent} /> : null}
      {reports.data && reports.data.length === 0 ? (
        <Surface>
          <AppText variant="body" color={colors.textMuted}>
            {view === 'open' ? 'No open reports. Nice.' : 'No handled reports yet.'}
          </AppText>
        </Surface>
      ) : null}

      {(reports.data ?? []).map((report) => (
        <Surface key={report.id} style={{ gap: 10 }}>
          <View style={styles.row}>
            <Badge label={reasonLabel[report.reason] ?? report.reason} tone="muted" />
            <AppText variant="small" style={{ marginLeft: 'auto' }}>
              {timeAgo(report.created_at)}
            </AppText>
          </View>
          <AppText variant="body">
            <AppText variant="bodyStrong">{report.reporter?.display_name ?? 'A member'}</AppText> reported{' '}
            {report.message_id ? 'a message from ' : report.listing_id ? 'a listing by ' : ''}
            <AppText variant="bodyStrong">{report.reported?.display_name ?? 'a member'}</AppText>
          </AppText>
          {report.snapshot ? (
            <View style={styles.quote}>
              <AppText variant="body" color={colors.textSoft}>
                “{report.snapshot}”
              </AppText>
            </View>
          ) : null}
          {report.details ? (
            <AppText variant="small" color={colors.textSoft}>
              Reporter’s note: {report.details}
            </AppText>
          ) : null}
          {report.listing ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/market/[id]', params: { id: report.listing!.id } })}
            >
              <AppText variant="smallStrong" color={colors.accent}>
                Open listing: {report.listing.title}
                {report.listing.hidden_at ? ' (hidden)' : ''}
              </AppText>
            </Pressable>
          ) : null}
          {report.reported ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/u/[id]', params: { id: report.reported!.id } })}
            >
              <AppText variant="smallStrong" color={colors.accent}>
                Open {report.reported.display_name ?? 'member'}’s profile
              </AppText>
            </Pressable>
          ) : null}

          <View style={styles.actions}>
            {report.status === 'open' ? (
              <>
                <Button label="Resolve" icon="check" loading={busyId === report.id} onPress={() => act(report, () => setReportStatus(report.id, 'resolved'))} />
                <Button label="Dismiss" variant="outline" onPress={() => act(report, () => setReportStatus(report.id, 'dismissed'))} />
              </>
            ) : (
              <Button label="Reopen" variant="outline" onPress={() => act(report, () => setReportStatus(report.id, 'open'))} />
            )}
            {report.listing ? (
              <Button
                label={report.listing.hidden_at ? 'Restore listing' : 'Hide listing'}
                variant={report.listing.hidden_at ? 'outline' : 'danger'}
                onPress={() => act(report, () => setListingHidden(report.listing!.id, !report.listing!.hidden_at))}
              />
            ) : null}
          </View>
        </Surface>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

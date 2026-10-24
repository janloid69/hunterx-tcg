import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/Chip';
import { CardArt } from '@/components/CardArt';
import { Sheet } from '@/components/Sheet';
import { Badge, Notice, Screen, Surface, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  getCatalogQueue,
  mergeCatalogItem,
  removeCatalogItem,
  saveCatalogItem,
  searchApprovedCatalog,
  type CatalogQueueItem,
} from '@/lib/catalogReview';
import { timeAgo } from '@/lib/format';
import { REPORT_REASONS, getReports, setListingHidden, setReportStatus } from '@/lib/market';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { CatalogItem, Report } from '@/lib/types';
import { useQuery, type QueryState } from '@/lib/useQuery';

const reasonLabel = Object.fromEntries(REPORT_REASONS.map((reason) => [reason.value, reason.label]));

type Section = 'reports' | 'catalog';

export default function ModScreen() {
  const { profile } = useAuth();
  const [section, setSection] = useState<Section>('reports');
  const queue = useQuery(getCatalogQueue, []);
  const waiting = queue.data?.length ?? 0;

  if (profile && !profile.is_mod) {
    return (
      <Screen>
        <Notice tone="error">This page is for HunterX mods.</Notice>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        MOD TOOLS
      </AppText>
      <ChipRow<Section>
        accessibilityLabel="Section"
        options={[
          { value: 'reports', label: 'Reports' },
          { value: 'catalog', label: waiting ? `Catalog (${waiting})` : 'Catalog' },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === 'reports' ? <ReportsPanel /> : <CatalogPanel queue={queue} />}
    </Screen>
  );
}

function CatalogPanel({ queue }: { queue: QueryState<CatalogQueueItem[]> }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogQueueItem | null>(null);
  const [merging, setMerging] = useState<CatalogQueueItem | null>(null);

  async function act(item: CatalogQueueItem, action: () => Promise<void>, done: string) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      queue.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AppText variant="body" color={colors.textMuted}>
        Toys and sealed products members added. Approve them (fix the name first if needed), merge duplicates into the
        right item, or remove junk nobody uses yet. Until approved, only the member who added an item can see it.
      </AppText>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {queue.error ? <Notice tone="error">{queue.error}</Notice> : null}
      {queue.loading && !queue.data ? <ActivityIndicator color={colors.accent} /> : null}
      {queue.data && queue.data.length === 0 ? (
        <Surface>
          <AppText variant="body" color={colors.textMuted}>
            Nothing waiting for review.
          </AppText>
        </Surface>
      ) : null}

      {(queue.data ?? []).map((item) => (
        <Surface key={item.id} style={{ gap: 10 }}>
          <View style={styles.row}>
            <CardArt gameId={item.game_id} imageUrl={item.image_url} width={44} height={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">{item.name}</AppText>
              <AppText variant="small">
                {[item.kind === 'sealed' ? 'Sealed' : 'Toy', item.brand, item.line].filter(Boolean).join(' · ')}
              </AppText>
              <AppText variant="small">
                Added by {item.added_by_name ?? 'a member'} {timeAgo(item.created_at)}
                {item.in_binders || item.in_listings
                  ? ` · in ${item.in_binders} binder${item.in_binders === 1 ? '' : 's'}, ${item.in_listings} listing${item.in_listings === 1 ? '' : 's'}`
                  : ''}
              </AppText>
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              label="Approve"
              icon="check"
              loading={busyId === item.id}
              onPress={() => act(item, () => saveCatalogItem(item.id, item), `Approved ${item.name}.`)}
            />
            <Button label="Edit & approve" variant="outline" icon="edit" onPress={() => setEditing(item)} />
            <Button label="Merge into…" variant="outline" onPress={() => setMerging(item)} />
            <Button
              label="Remove"
              variant="danger"
              icon="trash"
              onPress={() => act(item, () => removeCatalogItem(item.id), `Removed ${item.name}.`)}
            />
          </View>
        </Surface>
      ))}

      <EditCatalogSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(fields) => {
          const item = editing!;
          setEditing(null);
          act(item, () => saveCatalogItem(item.id, fields), `Approved ${fields.name}.`);
        }}
      />
      <MergeCatalogSheet
        item={merging}
        onClose={() => setMerging(null)}
        onPick={(target) => {
          const item = merging!;
          setMerging(null);
          act(item, () => mergeCatalogItem(item.id, target.id), `Merged ${item.name} into ${target.name}. Binders and listings moved over.`);
        }}
      />
    </>
  );
}

function EditCatalogSheet({
  item,
  onClose,
  onSave,
}: {
  item: CatalogQueueItem | null;
  onClose: () => void;
  onSave: (fields: { name: string; brand: string; line: string }) => void;
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [line, setLine] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setName(item.name);
    setBrand(item.brand ?? '');
    setLine(item.line ?? '');
  }
  return (
    <Sheet visible={item !== null} title="Edit and approve" onClose={onClose}>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={120} />
      <TextField label="Brand (optional)" value={brand} onChangeText={setBrand} maxLength={60} placeholder="e.g. Hot Wheels, Takara Tomy" />
      <TextField label="Line or series (optional)" value={line} onChangeText={setLine} maxLength={80} placeholder="e.g. Car Culture, Beyblade X" />
      <Button label="Save and approve" icon="check" disabled={name.trim().length < 2} onPress={() => onSave({ name, brand, line })} />
    </Sheet>
  );
}

function MergeCatalogSheet({
  item,
  onClose,
  onPick,
}: {
  item: CatalogQueueItem | null;
  onClose: () => void;
  onPick: (target: CatalogItem) => void;
}) {
  const [term, setTerm] = useState('');
  const results = useQuery(
    () => (item ? searchApprovedCatalog(item.kind, term, item.id) : Promise.resolve([])),
    [item?.id, term],
  );
  return (
    <Sheet visible={item !== null} title={item ? `Merge “${item.name}” into…` : 'Merge'} onClose={onClose}>
      <AppText variant="body" color={colors.textMuted}>
        Pick the approved item this is a duplicate of. Members’ binders, listings and sale prices move to it.
      </AppText>
      <TextField label="Search approved items" value={term} onChangeText={setTerm} placeholder="Type at least 2 letters" autoCorrect={false} />
      {results.error ? <Notice tone="error">{results.error}</Notice> : null}
      {term.trim().length >= 2 && results.data && results.data.length === 0 ? (
        <AppText variant="small">No approved {item?.kind === 'sealed' ? 'sealed products' : 'toys'} match.</AppText>
      ) : null}
      {(results.data ?? []).map((target) => (
        <Pressable
          key={target.id}
          accessibilityRole="button"
          onPress={() => onPick(target)}
          style={({ pressed }) => [styles.pick, pressed ? { backgroundColor: colors.surface2 } : null]}
        >
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {target.name}
          </AppText>
          <AppText variant="small">{[target.brand, target.line].filter(Boolean).join(' · ')}</AppText>
        </Pressable>
      ))}
    </Sheet>
  );
}

function ReportsPanel() {
  const [view, setView] = useState<'open' | 'closed'>('open');
  const reports = useQuery(() => getReports(view), [view]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

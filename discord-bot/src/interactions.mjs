// Buttons on report tickets: Resolve, Dismiss, Reopen, Hide or Restore the
// listing. Only members with the Mod role in Discord can use them, and the
// database double-checks that their HunterX account is a mod too.

import { reportTicket } from './render.mjs';

const InteractionType = { MESSAGE_COMPONENT: 3 };
const Callback = { MESSAGE: 4, DEFERRED_UPDATE: 6 };
const EPHEMERAL = 64;
const ACTIONS = new Set(['resolve', 'dismiss', 'reopen', 'hide', 'restore']);

const actionWords = {
  resolve: 'resolved',
  dismiss: 'dismissed',
  reopen: 'reopened',
  hide: 'hid the listing for',
  restore: 'restored the listing for',
};

export function createInteractions({ store, discord, config, log = () => {} }) {
  return async function onInteraction(interaction) {
    if (interaction.type !== InteractionType.MESSAGE_COMPONENT) return;
    const [ns, area, action, reportId] = String(interaction.data?.custom_id ?? '').split(':');
    if (ns !== 'hx' || area !== 'report' || !ACTIONS.has(action) || !reportId) return;

    const member = interaction.member;
    const isMod = interaction.guild_id === config.guildId && (member?.roles ?? []).includes(config.modRoleId);
    if (!isMod) {
      await discord.interactionCallback(interaction.id, interaction.token, {
        type: Callback.MESSAGE,
        data: { content: 'Only HunterX mods can use these buttons.', flags: EPHEMERAL },
      });
      return;
    }

    // Tell Discord we got it (must happen within 3 seconds), then do the work.
    await discord.interactionCallback(interaction.id, interaction.token, { type: Callback.DEFERRED_UPDATE });
    const appId = interaction.application_id;
    const who = member.nick || member.user?.global_name || member.user?.username || 'A mod';

    try {
      await store.moderate(member.user.id, reportId, action);
    } catch (error) {
      const text = error.hint ? `${error.detail}. ${error.hint}` : `That didn't work: ${error.detail ?? error.message}`;
      log(`${who} pressed ${action} on report ${reportId.slice(0, 8)} but it failed: ${error.message}`);
      await discord.followup(appId, interaction.token, { content: text, flags: EPHEMERAL });
      return;
    }

    log(`${who} ${actionWords[action]} report ${reportId.slice(0, 8)}`);
    const report = await store.report(reportId);
    if (report) {
      await discord.editOriginal(appId, interaction.token, reportTicket(report, { siteUrl: config.siteUrl, modRoleId: config.modRoleId }));
    }
  };
}

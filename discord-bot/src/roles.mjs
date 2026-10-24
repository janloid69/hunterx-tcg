// Keeps HunterX profiles in step with Discord: in the server or not, Verified
// Seller (hunterxcircle role) and Mod. Updates right away when a member joins,
// leaves or changes roles, and checks everyone every few hours as a backup.

export function createRoleSync({ store, discord, config, log = () => {} }) {
  const roleIds = { circleRoleId: config.circleRoleId, modRoleId: config.modRoleId };
  let fullSyncRunning = null;

  async function onMemberEvent(type, data) {
    if (data?.guild_id !== config.guildId || !data.user || data.user.bot) return;
    if (type === 'GUILD_MEMBER_REMOVE') {
      const changed = await store.syncRoles({ left: [data.user.id], ...roleIds });
      if (changed) log(`${data.user.username} left the server; their Verified Seller and Mod badges are off`);
      return;
    }
    const changed = await store.syncRoles({ members: [{ id: data.user.id, roles: data.roles ?? [] }], ...roleIds });
    if (changed) log(`Updated badges for ${data.user.username} from their Discord roles`);
  }

  async function runFullSync() {
    const members = await discord.listMembers(config.guildId);
    if (members.length === 0) {
      log('Skipped the role check: Discord returned no members');
      return 0;
    }
    const changed = await store.syncRoles({
      members: members.map((member) => ({ id: member.user.id, roles: member.roles ?? [] })),
      full: true,
      ...roleIds,
    });
    log(`Role check: ${members.length} server members, ${changed} HunterX profile${changed === 1 ? '' : 's'} updated`);
    return changed;
  }

  /** Checks everyone; if a check is already running, waits for that one. */
  function fullSync() {
    if (!fullSyncRunning) {
      fullSyncRunning = runFullSync().finally(() => {
        fullSyncRunning = null;
      });
    }
    return fullSyncRunning;
  }

  return { onMemberEvent, fullSync };
}

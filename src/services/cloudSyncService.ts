import { db } from '../db/database';

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url && url.trim() && key && key.trim());
}

/**
 * Flushes all pending local Sync-Outbox operations to Supabase PostgreSQL REST API
 * when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
 */
export async function flushSyncOutboxToCloud(): Promise<{
  flushedCount: number;
  mode: 'CLOUD' | 'LOCAL_ONLY';
}> {
  const pendingItems = await db.syncOutbox.where('synced').equals(0).toArray();
  if (pendingItems.length === 0) {
    return { flushedCount: 0, mode: isSupabaseConfigured() ? 'CLOUD' : 'LOCAL_ONLY' };
  }

  if (!isSupabaseConfigured()) {
    return { flushedCount: 0, mode: 'LOCAL_ONLY' };
  }

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  let flushedCount = 0;

  for (const item of pendingItems) {
    try {
      const endpoint = `${supabaseUrl}/rest/v1/${item.entity_table}`;
      const headers: Record<string, string> = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      };

      if (item.operation === 'DELETE') {
        const res = await fetch(`${endpoint}?id=eq.${encodeURIComponent(item.entity_id)}`, {
          method: 'DELETE',
          headers
        });
        if (res.ok && item.id !== undefined) {
          await db.syncOutbox.update(item.id, { synced: 1 });
          flushedCount++;
        }
      } else {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: item.payload_json
        });
        if (res.ok && item.id !== undefined) {
          await db.syncOutbox.update(item.id, { synced: 1 });
          flushedCount++;
        }
      }
    } catch {
      // Remain in outbox for next online retry
    }
  }

  return { flushedCount, mode: 'CLOUD' };
}

/**
 * Exports the entire local club database as a JSON string for backup or manual device transfer.
 */
export async function exportClubDatabaseSnapshot(): Promise<string> {
  const [
    clubs,
    clubMembers,
    teams,
    teamMembers,
    exercises,
    sessionTemplates,
    multiWeekPlans,
    planWeeks,
    trainingSessions,
    sessionPhases,
    sessionBlocks,
    sessionNotes
  ] = await Promise.all([
    db.clubs.toArray(),
    db.clubMembers.toArray(),
    db.teams.toArray(),
    db.teamMembers.toArray(),
    db.exercises.toArray(),
    db.sessionTemplates.toArray(),
    db.multiWeekPlans.toArray(),
    db.planWeeks.toArray(),
    db.trainingSessions.toArray(),
    db.sessionPhases.toArray(),
    db.sessionBlocks.toArray(),
    db.sessionNotes.toArray()
  ]);

  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      clubs,
      clubMembers,
      teams,
      teamMembers,
      exercises,
      sessionTemplates,
      multiWeekPlans,
      planWeeks,
      trainingSessions,
      sessionPhases,
      sessionBlocks,
      sessionNotes
    },
    null,
    2
  );
}

import type { Pool } from 'pg';

export async function purgeExpiredTelemetry(
  pool: Pick<Pool, 'query'>,
  now = new Date(),
): Promise<Readonly<{ eventsDeleted: number; aggregatesDeleted: number }>> {
  const result = await pool.query<{ events_deleted: number; aggregates_deleted: number }>(`
    WITH expired_events AS (
      SELECT event_id FROM public_answer_events WHERE expires_at <= $1 ORDER BY event_id LIMIT 1000
    ), deleted_events AS (
      DELETE FROM public_answer_events WHERE event_id IN (SELECT event_id FROM expired_events) RETURNING 1
    ), expired_aggregates AS (
      SELECT day,result_kind FROM public_answer_daily_aggregates WHERE expires_at <= $1 ORDER BY day,result_kind LIMIT 1000
    ), deleted_aggregates AS (
      DELETE FROM public_answer_daily_aggregates target USING expired_aggregates expired
      WHERE target.day=expired.day AND target.result_kind=expired.result_kind RETURNING 1
    )
    SELECT (SELECT count(*)::int FROM deleted_events) AS events_deleted,
           (SELECT count(*)::int FROM deleted_aggregates) AS aggregates_deleted
  `, [now]);
  const row = result.rows[0]!;
  return Object.freeze({ eventsDeleted: row.events_deleted, aggregatesDeleted: row.aggregates_deleted });
}

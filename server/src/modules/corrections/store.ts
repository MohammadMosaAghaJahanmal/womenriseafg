import { randomUUID } from 'node:crypto';
import { QueryTypes, type Sequelize } from 'sequelize';
import { DiscoveryError } from '../discovery/contract';
import { discoverySearch } from '../discovery/search';
import { createCollectionStore } from '../discovery/store';
import { correctionTarget, type CorrectionState } from './contract';

interface CorrectionRow {
  id: string;
  resourcePath: string;
  message: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export function createCorrectionStore(db: Sequelize) {
  const search = discoverySearch(db);
  const collections = createCollectionStore(db);

  async function targetResource(locator: NonNullable<ReturnType<typeof correctionTarget>>) {
    if (locator.kind !== 'collection') {
      return search.publishedTarget(locator.kind, locator.slug, 'parentSlug' in locator ? locator.parentSlug : undefined);
    }
    try {
      const collection = await collections.publicPath(locator.slug);
      return { id: collection.id, kind: 'collection', href: '/collections/' + collection.slug };
    } catch (error) {
      if (error instanceof DiscoveryError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  }

  async function submit(resource: string, message: string) {
    const locator = correctionTarget(resource);
    if (!locator) return false;
    // Only keep the canonical path returned by the published content lookup.
    const item = await targetResource(locator);
    if (!item) return false;
    await db.query(`INSERT INTO learner_corrections
      (id, resource_id, resource_kind, resource_path, message, created_at)
      VALUES ($id, $resourceId, $kind, $resourcePath, $message, UTC_TIMESTAMP(3))`,
    { bind: { id: randomUUID(), resourceId: item.id, kind: item.kind, resourcePath: item.href, message } });
    return true;
  }

  async function list(state: CorrectionState, page: number) {
    const pageSize = 20;
    const predicate = state === 'open' ? 'resolved_at IS NULL' : 'resolved_at IS NOT NULL';
    const [rows, counts] = await Promise.all([
      db.query<CorrectionRow>(`SELECT id, resource_path AS resourcePath, message, created_at AS createdAt, resolved_at AS resolvedAt
        FROM learner_corrections WHERE ${predicate} ORDER BY created_at DESC, id LIMIT $limit OFFSET $offset`,
      { type: QueryTypes.SELECT, bind: { limit: pageSize, offset: (page - 1) * pageSize } }),
      db.query<{ total: number | string }>(`SELECT COUNT(*) AS total FROM learner_corrections WHERE ${predicate}`,
        { type: QueryTypes.SELECT }),
    ]);
    return { page, pageSize, total: Number(counts[0]?.total ?? 0), items: rows };
  }

  async function changeState(id: string, state: CorrectionState) {
    const close = state === 'resolved';
    const [, changed] = await db.query(`UPDATE learner_corrections SET resolved_at = ${close ? 'UTC_TIMESTAMP(3)' : 'NULL'}
      WHERE id = $id AND resolved_at IS ${close ? 'NULL' : 'NOT NULL'}`, { type: QueryTypes.UPDATE, bind: { id } });
    return changed === 1;
  }

  async function retention(cutoff: Date, apply: boolean) {
    const eligible = 'resolved_at IS NOT NULL AND resolved_at < $cutoff';
    if (apply) {
      const [, metadata] = await db.query(`DELETE FROM learner_corrections WHERE ${eligible}`, { bind: { cutoff } });
      return (metadata as { affectedRows: number }).affectedRows;
    }
    const [row] = await db.query<{ total: number | string }>(
      `SELECT COUNT(*) AS total FROM learner_corrections WHERE ${eligible}`, { type: QueryTypes.SELECT, bind: { cutoff } });
    return Number(row?.total ?? 0);
  }

  return { submit, list, changeState, retention };
}

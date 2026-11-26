import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { publicCourse } from '../courses/reader';
import { createDiscoveryStore } from '../discovery/store';
import { normalizeEducationSearch } from '../education/models';
import { HomepageError, type HomepageBranding, type HomepageItem, type HomepageSettings, type HomeQuery, type SectionKey } from './contract';
import { homepageReader, mergeRecentlyAdded, type Candidate, type HomepageKind } from './reader';

interface ImageQuery { q: string; page: number; pageSize: number }
type PublicContent = Partial<Record<SectionKey, HomepageItem[]>>;
const cardLimit = 4;
const usualSections = [
  ['subjects', 'subject'], ['videos', 'video'], ['shorts', 'short'], ['ai', 'ai'], ['paths', 'path'],
] as const satisfies ReadonlyArray<[SectionKey, HomepageKind]>;
const recentKinds = ['course', 'video', 'short', 'book', 'ai', 'path', 'quiz'] as const satisfies readonly HomepageKind[];
const dailyKinds = new Set<HomepageItem['kind']>(['course', 'video', 'short', 'book', 'quiz']);
const publishedImage = "kind = 'image' AND status = 'published'";

export function createHomepageStore(db: Sequelize) {
  const reader = homepageReader(db);
  const discovery = createDiscoveryStore(db);

  async function read(transaction: Transaction, lock = false): Promise<HomepageSettings> {
    const [row] = await db.query<{ config: string; version: number }>(`
      SELECT CAST(config AS CHAR CHARACTER SET utf8mb4) AS config, version FROM homepage_settings
      WHERE id = 1${lock ? ' FOR UPDATE' : ''}`, { type: QueryTypes.SELECT, transaction });
    if (!row) throw new HomepageError('HOME_UNAVAILABLE');
    return { ...(JSON.parse(row.config) as Omit<HomepageSettings, 'version'>), version: row.version };
  }

  async function validateBrandAssets(branding: HomepageBranding, transaction: Transaction) {
    const ids = [...new Set([branding.logoId, branding.faviconId].filter((value): value is string => !!value))];
    if (!ids.length) return branding;
    const assets = new Set((await db.query<{ id: string }>(`SELECT id FROM media_assets WHERE id IN (:ids) AND ${publishedImage}`,
      { type: QueryTypes.SELECT, transaction, replacements: { ids } })).map(row => row.id));
    return { ...branding, logoId: branding.logoId && assets.has(branding.logoId) ? branding.logoId : null,
      faviconId: branding.faviconId && assets.has(branding.faviconId) ? branding.faviconId : null };
  }

  async function selectors(settings: HomepageSettings, transaction: Transaction) {
    const [courses, books] = await Promise.all([
      reader.list('course', { ids: settings.featuredCourseIds, limit: 8 }, transaction),
      reader.list('book', { ids: settings.recommendedBookIds, limit: 8 }, transaction),
    ]);
    return { featuredCourses: courses.map(candidate => candidate.item), recommendedBooks: books.map(candidate => candidate.item) };
  }

  async function publicPanels(home: HomeQuery, transaction: Transaction) {
    const settings = await read(transaction);
    const visible = new Set(settings.sections.filter(section => section.enabled).map(section => section.key));
    const branding = await validateBrandAssets(settings.branding, transaction);
    const panels: Partial<Record<SectionKey, Candidate[]>> = {};

    const curatedCourses = visible.has('featured') || visible.has('recommendedCourses')
      ? await reader.list('course', { ...home, ids: settings.featuredCourseIds, limit: 8 }, transaction)
      : [];
    if (visible.has('featured')) panels.featured = curatedCourses;
    if (visible.has('recommendedCourses')) {
      const [seed] = curatedCourses.length ? curatedCourses : await reader.list('course', { ...home, limit: 1 }, transaction);
      if (seed) {
        panels.recommendedCourses = await reader.list('course', {
          ...home, exclude: curatedCourses.map(candidate => candidate.item.id), related: seed, limit: cardLimit,
        }, transaction);
      }
    }
    if (visible.has('popular')) {
      panels.popular = await reader.list('course', { ...home, popular: true, limit: cardLimit }, transaction);
    }
    if (visible.has('books')) {
      panels.books = await reader.list('book', {
        ...home, ids: settings.recommendedBookIds.length ? settings.recommendedBookIds : undefined,
        limit: settings.recommendedBookIds.length ? 8 : cardLimit,
      }, transaction);
    }
    for (const [key, kind] of usualSections) {
      if (visible.has(key)) {
        panels[key] = await reader.list(kind, { ...home, limit: key === 'subjects' ? 8 : cardLimit }, transaction);
      }
    }
    if (visible.has('recent')) {
      const groups = await Promise.all(recentKinds.map(kind => reader.list(kind, { ...home, recent: true, limit: cardLimit }, transaction)));
      panels.recent = mergeRecentlyAdded(groups, cardLimit);
    }

    const content: PublicContent = {};
    await reader.taxonomyLabels(Object.values(panels).flat(), home.preferred ?? home.language ?? 'en', transaction);
    for (const section of settings.sections) {
      const items = panels[section.key];
      if (items?.length) content[section.key] = items.map(candidate => candidate.item);
    }
    const announcements = visible.has('announcements') ? settings.announcements.filter(item => item.enabled).map(({ translations }) =>
      ({ translations })) : [];
    return { branding, sections: settings.sections, announcements, content };
  }

  return {
    getBranding() {
      return db.transaction(async transaction => ({ branding: await validateBrandAssets((await read(transaction)).branding, transaction) }));
    },

    async getHomepage(home: HomeQuery) {
      const page = await db.transaction(transaction => publicPanels(home, transaction));
      if (page.sections.some(section => section.key === 'daily' && section.enabled)) {
        const { item } = await discovery.daily(home.language ?? home.preferred);
        if (item) {
          if (dailyKinds.has(item.kind)) {
            const [candidate] = await db.transaction(transaction => reader.list(item.kind as HomepageKind,
              { ...home, ids: [item.id], limit: 1 }, transaction));
            if (candidate) page.content.daily = [candidate.item];
          } else if (!home.language || item.locale === home.language) {
            page.content.daily = [{ ...item, imageId: null, languages: [item.locale] }];
          }
        }
      }
      return page;
    },

    getSettings() {
      return db.transaction(async transaction => {
        const settings = await read(transaction);
        return { settings, selected: await selectors(settings, transaction) };
      });
    },

    update(input: HomepageSettings) {
      return db.transaction(async transaction => {
        const current = await read(transaction, true);
        if (current.version !== input.version) throw new HomepageError('STALE_VERSION');
        const branding = await validateBrandAssets(input.branding, transaction);
        const selected = await selectors(input, transaction);
        if (branding.logoId !== input.branding.logoId || branding.faviconId !== input.branding.faviconId ||
          selected.featuredCourses.length !== input.featuredCourseIds.length || selected.recommendedBooks.length !== input.recommendedBookIds.length) {
          throw new HomepageError('INVALID_REFERENCE');
        }
        const { version, ...configuration } = input;
        await db.query(`UPDATE homepage_settings SET config = $config, version = version + 1, updated_at = NOW(3)
          WHERE id = 1`, { bind: { config: JSON.stringify(configuration) }, transaction });
        return { settings: { ...configuration, version: version + 1 }, selected };
      });
    },

    async publishedImages(query: ImageQuery) {
      const q = normalizeEducationSearch(query.q);
      const bindings = { q, limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
      const where = `WHERE ${publishedImage}${q ? ' AND LOCATE($q, search_text) > 0' : ''}`;
      return db.transaction(async transaction => {
        const [total] = await db.query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM media_assets ${where}`,
          { type: QueryTypes.SELECT, transaction, bind: { q } });
        const items = await db.query<{ id: string; title: string; locale: string | null }>(
          `SELECT id, title, language AS locale FROM media_assets ${where}
          ORDER BY updated_at DESC, id ASC LIMIT $limit OFFSET $offset`, { type: QueryTypes.SELECT, transaction, bind: bindings });
        return { items: items.map(({ id, title, locale }) => ({ id, title, ...(locale ? { locale } : {}) })),
          total: Number(total?.count ?? 0), page: query.page, pageSize: query.pageSize };
      });
    },

    async recordCourseOpen(slug: string) {
      const [, affected] = await db.query(`
        INSERT INTO homepage_course_opens (course_id, opens)
        SELECT c.id, 1 FROM courses c WHERE c.slug = $slug AND ${publicCourse}
        ON DUPLICATE KEY UPDATE opens = IF(opens < 18446744073709551615, opens + 1, opens)`,
      { type: QueryTypes.INSERT, bind: { slug } });
      if (!affected) throw new HomepageError('COURSE_UNAVAILABLE');
    },
  };
}

export type HomepageStore = ReturnType<typeof createHomepageStore>;

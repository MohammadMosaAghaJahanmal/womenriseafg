import { DataTypes, Model, Sequelize } from 'sequelize';
import type { EducationKind, EducationStatus } from './contract';

export interface EntryRow {
  id: string;
  kind: EducationKind;
  slug: string;
  status: EducationStatus;
  categoryId: string | null;
  categoryKind: 'categories' | null;
  gradeNumber: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface LanguageRow {
  entryId: string;
  entryKind: 'languages';
  locale: string;
  direction: 'ltr' | 'rtl';
}

export interface TranslationRow {
  entryId: string;
  locale: string;
  name: string;
  description: string;
  searchText: string;
}

export function defineEducationModels(db: Sequelize) {
  const Entry = db.define<Model<EntryRow>>('EducationEntry', {
    id: { type: DataTypes.CHAR(36), primaryKey: true },
    kind: { type: DataTypes.STRING(16), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false },
    categoryId: { type: DataTypes.CHAR(36), field: 'category_id' },
    categoryKind: { type: DataTypes.STRING(16), field: 'category_kind' },
    gradeNumber: { type: DataTypes.TINYINT.UNSIGNED, field: 'grade_number' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE(3), allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE(3), allowNull: false, field: 'updated_at' },
  }, { tableName: 'education_entries', timestamps: false });
  const Language = db.define<Model<LanguageRow>>('EducationLanguage', {
    entryId: { type: DataTypes.CHAR(36), primaryKey: true, field: 'entry_id' },
    entryKind: { type: DataTypes.STRING(16), allowNull: false, field: 'entry_kind' },
    locale: { type: DataTypes.STRING(35), allowNull: false },
    direction: { type: DataTypes.STRING(3), allowNull: false },
  }, { tableName: 'education_languages', timestamps: false });
  const Translation = db.define<Model<TranslationRow>>('EducationTranslation', {
    entryId: { type: DataTypes.CHAR(36), primaryKey: true, field: 'entry_id' },
    locale: { type: DataTypes.STRING(35), primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    searchText: { type: DataTypes.TEXT, allowNull: false, field: 'search_text' },
  }, { tableName: 'education_translations', timestamps: false });
  return { Entry, Language, Translation };
}

export function normalizeEducationSearch(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

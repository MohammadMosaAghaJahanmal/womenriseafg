import { DataTypes, type Model, type Sequelize } from 'sequelize';
import type { LearningMediaRecord, LearningMediaTranslation } from './contract';

export interface LearningMediaRow extends Omit<LearningMediaRecord,
  'createdAt' | 'updatedAt' | 'reviewedAt' | 'translations' | 'thumbnailId' | 'durationMs' | 'relatedCourseSlug'> {
  creatorId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewedMediaVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LearningMediaTranslationRow extends LearningMediaTranslation {
  learningMediaId: string;
  searchText: string;
}

export function defineLearningMediaModels(db: Sequelize) {
  const id = DataTypes.CHAR(36);
  const date = DataTypes.DATE(3);
  const version = DataTypes.INTEGER.UNSIGNED;
  const Item = db.define<Model<LearningMediaRow>>('LearningMedia', {
    id: { type: id, primaryKey: true },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    kind: { type: DataTypes.STRING(12), allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false },
    version: { type: version, allowNull: false },
    mediaId: { type: id, field: 'media_id' },
    categoryId: { type: id, field: 'category_id' },
    relatedCourseId: { type: id, field: 'related_course_id' },
    relatedLessonId: { type: id, field: 'related_lesson_id' },
    aiOrigin: { type: DataTypes.STRING(20), field: 'ai_origin', allowNull: false },
    aiTool: { type: DataTypes.STRING(100), field: 'ai_tool', allowNull: false },
    aiNotes: { type: DataTypes.TEXT, field: 'ai_notes', allowNull: false },
    creatorId: { type: id, field: 'creator_id' },
    reviewedBy: { type: id, field: 'reviewed_by' },
    reviewedAt: { type: date, field: 'reviewed_at' },
    reviewedMediaVersion: { type: version, field: 'reviewed_media_version' },
    reviewNote: { type: DataTypes.TEXT, field: 'review_note', allowNull: false },
    createdAt: { type: date, field: 'created_at', allowNull: false },
    updatedAt: { type: date, field: 'updated_at', allowNull: false },
  }, { tableName: 'learning_media', timestamps: false });
  const Translation = db.define<Model<LearningMediaTranslationRow>>('LearningMediaTranslation', {
    learningMediaId: { type: id, field: 'learning_media_id', primaryKey: true },
    locale: { type: DataTypes.STRING(35), primaryKey: true },
    title: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    searchText: { type: DataTypes.TEXT, field: 'search_text', allowNull: false },
  }, { tableName: 'learning_media_translations', timestamps: false });
  return { Item, Translation };
}

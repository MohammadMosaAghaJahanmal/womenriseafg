import { DataTypes, type Model, type Sequelize } from 'sequelize';
import type { ChapterTranslation, CourseRecord, CourseTranslation, LessonRecord, LessonResource, LessonTranslation } from './contract';

export interface CourseRow extends Omit<CourseRecord, 'tagIds' | 'relatedCourseIds' | 'translations' | 'chapters' | 'createdAt' | 'updatedAt'> {
  creatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface CourseTranslationRow extends CourseTranslation { courseId: string; searchText: string }
interface ChapterRow { id: string; courseId: string; position: number }
interface ChapterTranslationRow extends ChapterTranslation { chapterId: string }
interface LessonRow extends Omit<LessonRecord, 'translations' | 'resources'> {
  courseId: string;
  chapterId: string;
  position: number;
}
interface LessonTranslationRow extends LessonTranslation { lessonId: string }
interface LessonResourceRow extends LessonResource { lessonId: string; position: number }
interface CourseTagRow { courseId: string; tagId: string }
interface CourseRelatedRow { courseId: string; relatedId: string; position: number }

export function defineCourseModels(db: Sequelize) {
  const id = DataTypes.CHAR(36);
  const title = DataTypes.STRING(240);
  const locale = DataTypes.STRING(35);
  const position = DataTypes.INTEGER.UNSIGNED;
  const Course = db.define<Model<CourseRow>>('Course', {
    id: { type: id, primaryKey: true },
    slug: { type: DataTypes.STRING(120), allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    subjectId: { type: id, field: 'subject_id' },
    levelId: { type: id, field: 'level_id' },
    gradeId: { type: id, field: 'grade_id' },
    thumbnailId: { type: id, field: 'thumbnail_id' },
    estimatedMinutes: { type: DataTypes.INTEGER.UNSIGNED, field: 'estimated_minutes' },
    instructor: { type: title, allowNull: false },
    creatorId: { type: id, field: 'creator_id' },
    createdAt: { type: DataTypes.DATE(3), field: 'created_at', allowNull: false },
    updatedAt: { type: DataTypes.DATE(3), field: 'updated_at', allowNull: false },
  }, { tableName: 'courses', timestamps: false });
  const CourseTranslation = db.define<Model<CourseTranslationRow>>('CourseTranslation', {
    courseId: { type: id, field: 'course_id', primaryKey: true },
    locale: { type: locale, primaryKey: true },
    title: { type: title, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    objectives: { type: DataTypes.TEXT, allowNull: false },
    prerequisites: { type: DataTypes.TEXT, allowNull: false },
    searchText: { type: DataTypes.TEXT, field: 'search_text', allowNull: false },
  }, { tableName: 'course_translations', timestamps: false });
  const Chapter = db.define<Model<ChapterRow>>('CourseChapter', {
    id: { type: id, primaryKey: true },
    courseId: { type: id, field: 'course_id', allowNull: false },
    position: { type: position, allowNull: false },
  }, { tableName: 'chapters', timestamps: false });
  const ChapterTranslation = db.define<Model<ChapterTranslationRow>>('CourseChapterTranslation', {
    chapterId: { type: id, field: 'chapter_id', primaryKey: true },
    locale: { type: locale, primaryKey: true },
    title: { type: title, allowNull: false },
  }, { tableName: 'chapter_translations', timestamps: false });
  const Lesson = db.define<Model<LessonRow>>('CourseLesson', {
    id: { type: id, primaryKey: true },
    courseId: { type: id, field: 'course_id', allowNull: false },
    chapterId: { type: id, field: 'chapter_id', allowNull: false },
    slug: { type: DataTypes.STRING(120), allowNull: false },
    kind: { type: DataTypes.STRING(12), allowNull: false },
    mediaId: { type: id, field: 'media_id' },
    position: { type: position, allowNull: false },
  }, { tableName: 'lessons', timestamps: false });
  const LessonTranslation = db.define<Model<LessonTranslationRow>>('CourseLessonTranslation', {
    lessonId: { type: id, field: 'lesson_id', primaryKey: true },
    locale: { type: locale, primaryKey: true },
    title: { type: title, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    body: { type: DataTypes.TEXT('medium'), allowNull: false },
  }, { tableName: 'lesson_translations', timestamps: false });
  const LessonResource = db.define<Model<LessonResourceRow>>('CourseLessonResource', {
    lessonId: { type: id, field: 'lesson_id', primaryKey: true },
    mediaId: { type: id, field: 'media_id', primaryKey: true },
    label: { type: title, allowNull: false },
    position: { type: position, allowNull: false },
  }, { tableName: 'lesson_resources', timestamps: false });
  const CourseTag = db.define<Model<CourseTagRow>>('CourseTag', {
    courseId: { type: id, field: 'course_id', primaryKey: true },
    tagId: { type: id, field: 'tag_id', primaryKey: true },
  }, { tableName: 'course_tags', timestamps: false });
  const CourseRelated = db.define<Model<CourseRelatedRow>>('CourseRelated', {
    courseId: { type: id, field: 'course_id', primaryKey: true },
    relatedId: { type: id, field: 'related_id', primaryKey: true },
    position: { type: position, allowNull: false },
  }, { tableName: 'course_related', timestamps: false });
  return { Course, CourseTranslation, Chapter, ChapterTranslation, Lesson, LessonTranslation, LessonResource, CourseTag, CourseRelated };
}

export type CourseModels = ReturnType<typeof defineCourseModels>;

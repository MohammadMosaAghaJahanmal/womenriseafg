import { DataTypes, type Model, type Sequelize } from 'sequelize';
import type { BookInput, BookRecord, BookTranslation } from './contract';

interface BookRow extends Omit<BookInput, 'translations'> {
  id: string;
  status: BookRecord['status'];
  version: number;
  creatorId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewedPdfVersion: number | null;
  reviewedCoverVersion: number | null;
  reviewNote: string;
  searchText: string;
  createdAt: Date;
  updatedAt: Date;
}

interface BookTranslationRow extends BookTranslation {
  bookId: string;
  searchText: string;
}

export function defineBookModels(db: Sequelize) {
  const id = DataTypes.CHAR(36);
  const date = DataTypes.DATE(3);
  const version = DataTypes.INTEGER.UNSIGNED;
  const Book = db.define<Model<BookRow>>('Book', {
    id: { type: id, primaryKey: true },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false },
    version: { type: version, allowNull: false },
    pdfId: { type: id, field: 'pdf_id' },
    coverId: { type: id, field: 'cover_id' },
    categoryId: { type: id, field: 'category_id' },
    levelId: { type: id, field: 'level_id' },
    gradeId: { type: id, field: 'grade_id' },
    contentLanguage: { type: DataTypes.STRING(35), field: 'content_language' },
    author: { type: DataTypes.STRING(150), allowNull: false },
    publisher: { type: DataTypes.STRING(150), allowNull: false },
    publicationYear: { type: DataTypes.SMALLINT.UNSIGNED, field: 'publication_year' },
    edition: { type: DataTypes.STRING(100), allowNull: false },
    searchText: { type: DataTypes.TEXT, field: 'search_text', allowNull: false },
    creatorId: { type: id, field: 'creator_id' },
    reviewedBy: { type: id, field: 'reviewed_by' },
    reviewedAt: { type: date, field: 'reviewed_at' },
    reviewedPdfVersion: { type: version, field: 'reviewed_pdf_version' },
    reviewedCoverVersion: { type: version, field: 'reviewed_cover_version' },
    reviewNote: { type: DataTypes.TEXT, field: 'review_note', allowNull: false },
    createdAt: { type: date, field: 'created_at', allowNull: false },
    updatedAt: { type: date, field: 'updated_at', allowNull: false },
  }, { tableName: 'books', timestamps: false });
  const Translation = db.define<Model<BookTranslationRow>>('BookTranslation', {
    bookId: { type: id, field: 'book_id', primaryKey: true },
    locale: { type: DataTypes.STRING(35), primaryKey: true },
    title: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    searchText: { type: DataTypes.TEXT, field: 'search_text', allowNull: false },
  }, { tableName: 'book_translations', timestamps: false });
  return { Book, Translation };
}

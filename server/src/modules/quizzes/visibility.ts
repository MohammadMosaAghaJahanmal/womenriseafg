export const publishedQuizLocale = (field: string) => `EXISTS (
  SELECT 1 FROM education_languages language
  JOIN education_entries entry ON entry.id = language.entry_id AND entry.status = 'published'
  WHERE language.locale = ${field}
) AND NOT EXISTS (
  SELECT 1 FROM quiz_question_links complete
  WHERE complete.quiz_id = z.id AND NOT EXISTS (
    SELECT 1 FROM quiz_question_translations prompt
    WHERE prompt.question_id = complete.question_id AND prompt.locale = ${field}
  )
)`;

export const readyQuiz = `z.status = 'published'
  AND EXISTS (SELECT 1 FROM quiz_question_links ready WHERE ready.quiz_id = z.id)
  AND EXISTS (SELECT 1 FROM quiz_translations available WHERE available.quiz_id = z.id AND ${publishedQuizLocale('available.locale')})`;
export const standaloneQuiz = `z.course_id IS NULL AND ${readyQuiz}`;

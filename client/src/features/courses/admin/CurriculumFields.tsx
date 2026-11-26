import { useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, DialogClose, InputField, PanelDialog, SelectField } from '../../../components/ui/Primitives';
import type { EducationRecord } from '../../education/api';
import { AssetSelection } from './Choices';
import { TextArea, TranslationFields } from './EditorFields';
import { lessonKinds, preferredTitle, type LessonKind } from './api';
import { emptyChapter, emptyChapterTranslation, emptyLesson, emptyLessonTranslation, emptyResource, moveItem, type LocalChapter, type LocalLesson } from './draft';

type DragItem = { chapterKey: string; lessonKey?: string };
type DropTarget = (event: DragEvent<HTMLLIElement>, item: DragItem) => void;
type DragControls = {
  start: (event: DragEvent<HTMLSpanElement>, item: DragItem) => void;
  end: () => void;
  over: DropTarget;
  drop: DropTarget;
  target: DragItem | undefined;
};

function RowControls({ name, index, count, item, drag, onMove }: {
  name: string;
  index: number;
  count: number;
  item: DragItem;
  drag: DragControls;
  onMove: (offset: number) => void;
}) {
  const { t } = useTranslation('courseAdmin');
  return <div className="course-order-controls">
    <span className="course-grip" title={t('drag')} draggable={true} aria-hidden="true"
      onDragStart={event => drag.start(event, item)} onDragEnd={drag.end}><GripVertical size={20} /></span>
    <Button variant="ghost" className="ui-icon-btn" title={t('moveUp')} aria-label={t('moveUpNamed', { name })}
      disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={18} aria-hidden="true" /></Button>
    <Button variant="ghost" className="ui-icon-btn" title={t('moveDown')} aria-label={t('moveDownNamed', { name })}
      disabled={index + 1 === count} onClick={() => onMove(1)}><ArrowDown size={18} aria-hidden="true" /></Button>
  </div>;
}

function RemoveRow({ type, onRemove }: { type: 'chapter' | 'lesson'; onRemove: () => void }) {
  const { t } = useTranslation('courseAdmin');
  const remove = t(type === 'chapter' ? 'removeChapter' : 'removeLesson');
  return <PanelDialog title={t(type === 'chapter' ? 'confirmRemoveChapter' : 'confirmRemoveLesson')} closeLabel={t('close')}
    trigger={<Button variant="ghost" className="course-remove"><Trash2 size={17} aria-hidden="true" />{remove}</Button>}>
    <div className="admin-dialog-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button onClick={onRemove}>{remove}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

function ResourceFields({ lesson, change, disabled }: { lesson: LocalLesson; change: (lesson: LocalLesson) => void; disabled: boolean }) {
  const { t } = useTranslation('courseAdmin');
  function patch(key: string, update: Partial<LocalLesson['resources'][number]>) {
    change({ ...lesson, resources: lesson.resources.map(item => item.key === key ? { ...item, ...update } : item) });
  }
  return <fieldset className="course-resources" disabled={disabled}><legend>{t('resources')}</legend>
    {lesson.resources.map(resource => <div className="course-resource" key={resource.key}>
      <InputField label={t('resourceLabel')} maxLength={150} dir="auto" value={resource.label}
        onChange={event => patch(resource.key, { label: event.target.value })} />
      <AssetSelection label={t('resourceFile')} picker={t('resourceSearch')} value={resource.mediaId}
        onChange={mediaId => patch(resource.key, { mediaId })} disabled={disabled} />
      {!disabled && <Button variant="ghost" className="course-remove" onClick={() => change({
        ...lesson, resources: lesson.resources.filter(item => item.key !== resource.key),
      })}><Trash2 size={17} aria-hidden="true" />{t('remove')}</Button>}
    </div>)}
    {!disabled && lesson.resources.length < 12 && <Button variant="secondary" onClick={() => change({ ...lesson, resources: [...lesson.resources, emptyResource()] })}>
      <Plus size={17} aria-hidden="true" />{t('addResource')}
    </Button>}
    {disabled && lesson.resources.length === 0 && <small>{t('none')}</small>}
  </fieldset>;
}

function ChapterName({ chapter, index }: { chapter: LocalChapter; index: number }) {
  const { t, i18n } = useTranslation('courseAdmin');
  const title = preferredTitle(chapter.translations, i18n.language);
  return <>{title?.title ?? t('chapter', { number: new Intl.NumberFormat(i18n.language).format(index + 1) })}</>;
}

function LessonEditor({ lesson, item, index, count, chapters, languages, disabled, drag, change, remove, move, moveTo }: {
  lesson: LocalLesson;
  item: DragItem;
  index: number;
  count: number;
  chapters: LocalChapter[];
  languages: EducationRecord[];
  disabled: boolean;
  drag: DragControls;
  change: (lesson: LocalLesson) => void;
  remove: () => void;
  move: (offset: number) => void;
  moveTo: (chapterKey: string) => void;
}) {
  const { t, i18n } = useTranslation('courseAdmin');
  const [open, setOpen] = useState(!lesson.id);
  const number = new Intl.NumberFormat(i18n.language);
  const title = preferredTitle(lesson.translations, i18n.language);
  const position = t('lesson', { number: number.format(index + 1) });
  const target = drag.target?.lessonKey === lesson.key;
  const otherChapters = chapters.filter(chapter => chapter.key !== item.chapterKey);
  return <li className={'course-lesson' + (target ? ' course-drop-target' : '')} onDragOver={event => drag.over(event, item)} onDrop={event => drag.drop(event, item)}>
    {!disabled && <RowControls name={title?.title ?? position} index={index} count={count} item={item} drag={drag} onMove={move} />}
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><span>{position}</span>{title && <strong><bdi lang={title.locale}>{title.title}</bdi></strong>}<small>{t(lesson.kind)}</small></summary>
      {open && <div className="course-lesson-content">
        <fieldset className="course-lesson-basics" disabled={disabled}>
          <legend className="admin-sr">{position}</legend>
          <div className="course-fields-grid">
            <InputField label={t('lessonSlug')} maxLength={80} value={lesson.slug} dir="ltr" autoComplete="off" spellCheck={false} aria-required
              onChange={event => change({ ...lesson, slug: event.target.value })} />
            <SelectField label={t('type')} value={lesson.kind} onChange={event => change({ ...lesson, kind: event.target.value as LessonKind, mediaId: null })}>
              {lessonKinds.map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}
            </SelectField>
          </div>
          {lesson.kind !== 'text' && <AssetSelection label={t('lessonFile')} picker={t('fileSearch')} kind={lesson.kind} value={lesson.mediaId}
            onChange={mediaId => change({ ...lesson, mediaId })} disabled={disabled} />}
        </fieldset>
        <TranslationFields records={languages} values={lesson.translations} onChange={translations => change({ ...lesson, translations })}
          blank={emptyLessonTranslation} titleLabel={t('lessonTitle')} disabled={disabled} render={(translation, direction, patch) => <>
            <TextArea label={t('description')} value={translation.description} onChange={description => patch({ description })}
              locale={translation.locale} direction={direction} />
            <TextArea label={t('body')} value={translation.body} onChange={body => patch({ body })} maxLength={12000} rows={5}
              locale={translation.locale} direction={direction} />
          </>} />
        <ResourceFields lesson={lesson} change={change} disabled={disabled} />
        {!disabled && <div className="course-row-footer">
          {otherChapters.length > 0 && <SelectField label={t('moveToChapter')} value=""
            onChange={event => { if (event.target.value) moveTo(event.target.value); }}>
            <option value="">{t('moveTo')}</option>
            {otherChapters.map(chapter => <option key={chapter.key} value={chapter.key}><ChapterName chapter={chapter} index={chapters.indexOf(chapter)} /></option>)}
          </SelectField>}
          <RemoveRow type="lesson" onRemove={remove} />
        </div>}
      </div>}
    </details>
  </li>;
}

function ChapterEditor({ chapter, index, chapters, languages, locale, disabled, drag, change, remove, move, moveLesson }: {
  chapter: LocalChapter;
  index: number;
  chapters: LocalChapter[];
  languages: EducationRecord[];
  locale: string;
  disabled: boolean;
  drag: DragControls;
  change: (chapter: LocalChapter) => void;
  remove: () => void;
  move: (offset: number) => void;
  moveLesson: (from: Required<DragItem>, to: DragItem) => void;
}) {
  const { t, i18n } = useTranslation('courseAdmin');
  const [open, setOpen] = useState(!chapter.id || index === 0);
  const number = new Intl.NumberFormat(i18n.language);
  const title = preferredTitle(chapter.translations, i18n.language);
  const position = t('chapter', { number: number.format(index + 1) });
  const target = drag.target?.chapterKey === chapter.key && !drag.target.lessonKey;
  const chapterItem = { chapterKey: chapter.key };
  const lessonCount = chapters.reduce((total, group) => total + group.lessons.length, 0);
  return <li className={'course-chapter' + (target ? ' course-drop-target' : '')} onDragOver={event => drag.over(event, chapterItem)} onDrop={event => drag.drop(event, chapterItem)}>
    {!disabled && <RowControls name={title?.title ?? position} index={index} count={chapters.length} item={chapterItem} drag={drag} onMove={move} />}
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><span>{position}</span>{title && <strong><bdi lang={title.locale}>{title.title}</bdi></strong>}
        <small>{t('lessonTotal', { count: chapter.lessons.length, amount: number.format(chapter.lessons.length) })}</small></summary>
      {open && <div className="course-chapter-content">
        <TranslationFields records={languages} values={chapter.translations} onChange={translations => change({ ...chapter, translations })}
          blank={emptyChapterTranslation} titleLabel={t('chapterTitle')} disabled={disabled} />
        {chapter.lessons.length ? <ol className="course-lessons">{chapter.lessons.map((lesson, lessonIndex) => {
          const item = { ...chapterItem, lessonKey: lesson.key };
          return <LessonEditor key={lesson.key} lesson={lesson} item={item} index={lessonIndex} count={chapter.lessons.length}
            chapters={chapters} languages={languages} disabled={disabled} drag={drag}
            change={updated => change({ ...chapter, lessons: chapter.lessons.map(value => value.key === lesson.key ? updated : value) })}
            remove={() => change({ ...chapter, lessons: chapter.lessons.filter(value => value.key !== lesson.key) })}
            move={offset => moveLesson(item, { ...chapterItem, lessonKey: chapter.lessons[lessonIndex + offset].key })}
            moveTo={chapterKey => moveLesson(item, { chapterKey })} />;
        })}</ol> : <p className="course-note">{t('noLessons')}</p>}
        {!disabled && <div className="course-row-footer">
          {lessonCount < 100 && <Button variant="secondary" onClick={() => change({ ...chapter, lessons: [...chapter.lessons, emptyLesson(locale)] })}>
            <Plus size={17} aria-hidden="true" />{t('addLesson')}
          </Button>}
          <RemoveRow type="chapter" onRemove={remove} />
        </div>}
      </div>}
    </details>
  </li>;
}

export function CurriculumFields({ chapters, languages, locale, disabled, change }: {
  chapters: LocalChapter[];
  languages: EducationRecord[];
  locale: string;
  disabled: boolean;
  change: (chapters: LocalChapter[]) => void;
}) {
  const { t } = useTranslation('courseAdmin');
  const dragging = useRef<DragItem>(undefined);
  const [target, setTarget] = useState<DragItem>();
  const [moves, setMoves] = useState(0);
  function moveChapter(from: number, to: number) {
    const next = moveItem(chapters, from, to);
    if (next === chapters) return;
    change(next);
    setMoves(count => count + 1);
  }
  function moveLesson(from: Required<DragItem>, to: DragItem) {
    const origin = chapters.find(chapter => chapter.key === from.chapterKey);
    const destination = chapters.find(chapter => chapter.key === to.chapterKey);
    const item = origin?.lessons.find(lesson => lesson.key === from.lessonKey);
    if (!origin || !destination || !item) return;
    const insertAt = to.lessonKey ? destination.lessons.findIndex(lesson => lesson.key === to.lessonKey) : destination.lessons.length;
    if (origin === destination) {
      const lessons = moveItem(origin.lessons, origin.lessons.indexOf(item), Math.min(insertAt, origin.lessons.length - 1));
      if (lessons === origin.lessons) return;
      change(chapters.map(chapter => chapter === origin ? { ...chapter, lessons } : chapter));
    } else {
      const inserted = [...destination.lessons];
      inserted.splice(Math.max(0, insertAt), 0, item);
      change(chapters.map(chapter => {
        if (chapter === origin) return { ...chapter, lessons: origin.lessons.filter(lesson => lesson !== item) };
        if (chapter === destination) return { ...chapter, lessons: inserted };
        return chapter;
      }));
    }
    setMoves(count => count + 1);
  }
  function isDropAllowed(item: DragItem) {
    return !disabled && dragging.current && (dragging.current.lessonKey || !item.lessonKey);
  }
  const drag: DragControls = {
    start(event, item) {
      event.stopPropagation();
      event.dataTransfer.setData('text/plain', item.lessonKey ?? item.chapterKey);
      event.dataTransfer.effectAllowed = 'move';
      dragging.current = item;
    },
    end() { dragging.current = undefined; setTarget(undefined); },
    over(event, item) {
      if (!isDropAllowed(item)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setTarget(current => current?.chapterKey === item.chapterKey && current.lessonKey === item.lessonKey ? current : item);
    },
    drop(event, item) {
      const from = dragging.current;
      if (!from || !isDropAllowed(item)) return;
      event.preventDefault();
      event.stopPropagation();
      if (from.lessonKey) moveLesson({ chapterKey: from.chapterKey, lessonKey: from.lessonKey }, item);
      else moveChapter(chapters.findIndex(chapter => chapter.key === from.chapterKey), chapters.findIndex(chapter => chapter.key === item.chapterKey));
      dragging.current = undefined;
      setTarget(undefined);
    },
    target,
  };
  return <section className="course-curriculum">
    <div className="course-section-head"><h2>{t('curriculum')}</h2>
      {!disabled && chapters.length < 20 && <Button variant="secondary" onClick={() => change([...chapters, emptyChapter(locale)])}><Plus size={17} aria-hidden="true" />{t('addChapter')}</Button>}
    </div>
    {chapters.length > 0 && !disabled && <p className="course-note">{t('reorderHint')}</p>}
    <div className="admin-sr" role="status" aria-live="polite">{moves > 0 && <span key={moves}>{t('orderChanged')}</span>}</div>
    {chapters.length ? <ol className="course-chapters">{chapters.map((chapter, index) => <ChapterEditor key={chapter.key} chapter={chapter}
      chapters={chapters} index={index} languages={languages} locale={locale} disabled={disabled} drag={drag}
      change={updated => change(chapters.map(value => value.key === chapter.key ? updated : value))}
      remove={() => change(chapters.filter(value => value.key !== chapter.key))}
      move={offset => moveChapter(index, index + offset)} moveLesson={moveLesson} />)}</ol> : <p className="course-note">{t('noChapters')}</p>}
  </section>;
}

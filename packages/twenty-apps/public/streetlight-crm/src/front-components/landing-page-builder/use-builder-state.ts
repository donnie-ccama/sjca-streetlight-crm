import {
  ITEM_FIELDS_BY_TYPE,
  SECTION_TYPE_LABELS,
  SINGLE_USE_TYPES,
  FIELDS_BY_TYPE,
} from 'src/front-components/landing-page-builder/section-config';
import {
  isHttpsUrl,
  type LandingPageSectionRecord,
} from 'src/shared/marketing/sections';
import type { ButtonAction, SectionType } from 'src/shared/marketing/types';

export type ButtonDraft = {
  label: string;
  action: ButtonAction | null;
  url: string;
};

export type ItemDraft = {
  value: string;
  label: string;
  title: string;
  text: string;
  amount: string;
  featured: boolean;
};

export type PhotoDraft = { fileId: string; label: string; url: string | null };

export type BuilderSection = {
  id: string;
  isNew: boolean;
  sectionType: SectionType;
  position: number;
  isVisible: boolean;
  eyebrow: string;
  heading: string;
  text: string;
  photo: PhotoDraft | null;
  primaryButton: ButtonDraft;
  secondaryButton: ButtonDraft;
  trustLine: string;
  badgeValue: string;
  badgeText: string;
  items: ItemDraft[];
  smallPrint: string;
  inviteMessage: string;
};

export type SectionPatch = Partial<
  Omit<BuilderSection, 'id' | 'isNew' | 'sectionType' | 'position'>
>;

export type BuilderState = {
  sections: BuilderSection[];
  selectedId: string | null;
  dirtyIds: string[];
  removedIds: string[];
  // Bumped on every change, so a save only clears ids that did not change while it ran.
  versions: Record<string, number>;
};

export type BuilderAction =
  | { type: 'select'; id: string }
  | { type: 'edit'; id: string; patch: SectionPatch }
  | { type: 'add'; id: string; sectionType: SectionType }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; toIndex: number }
  | { type: 'toggleVisible'; id: string }
  | { type: 'loaded'; records: LandingPageSectionRecord[] }
  | { type: 'saved'; records: LandingPageSectionRecord[] }
  | {
      type: 'committed';
      created?: { temporaryId: string; id: string; version: number };
      updated?: { id: string; version: number };
      deletedId?: string;
    };
export type SectionPayload = {
  sectionType: SectionType;
  position: number;
  isVisible: boolean;
  eyebrow: string;
  heading: string;
  text: string;
  photo: { fileId: string; label: string }[];
  primaryButtonLabel: string;
  primaryButtonAction: ButtonAction | null;
  primaryButtonUrl: { primaryLinkUrl: string };
  secondaryButtonLabel: string;
  secondaryButtonAction: ButtonAction | null;
  secondaryButtonUrl: { primaryLinkUrl: string };
  trustLine: string;
  badgeValue: string;
  badgeText: string;
  items: Record<string, string | boolean>[];
  smallPrint: string;
  inviteMessage: string;
};

const EMPTY_BUTTON: ButtonDraft = { label: '', action: null, url: '' };

export const EMPTY_ITEM: ItemDraft = {
  value: '',
  label: '',
  title: '',
  text: '',
  amount: '',
  featured: false,
};

const readString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const readItems = (raw: unknown): ItemDraft[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      value: readString(entry.value),
      label: readString(entry.label),
      title: readString(entry.title),
      text: readString(entry.text),
      amount: readString(entry.amount),
      featured: entry.featured === true,
    }));
};

const toButtonDraft = (
  label: string | null,
  action: ButtonAction | null,
  url: { primaryLinkUrl: string | null } | null,
): ButtonDraft => ({
  label: label ?? '',
  action,
  url: url?.primaryLinkUrl ?? '',
});

const toBuilderSection = (
  record: LandingPageSectionRecord,
  position: number,
): BuilderSection => {
  const photo = record.photo?.[0];

  return {
    id: record.id,
    isNew: false,
    sectionType: record.sectionType,
    position,
    isVisible: record.isVisible !== false,
    eyebrow: record.eyebrow ?? '',
    heading: record.heading ?? '',
    text: record.text ?? '',
    photo: photo
      ? { fileId: photo.fileId, label: photo.label ?? '', url: photo.url ?? null }
      : null,
    primaryButton: toButtonDraft(
      record.primaryButtonLabel,
      record.primaryButtonAction,
      record.primaryButtonUrl,
    ),
    secondaryButton: toButtonDraft(
      record.secondaryButtonLabel,
      record.secondaryButtonAction,
      record.secondaryButtonUrl,
    ),
    trustLine: record.trustLine ?? '',
    badgeValue: record.badgeValue ?? '',
    badgeText: record.badgeText ?? '',
    items: readItems(record.items),
    smallPrint: record.smallPrint ?? '',
    inviteMessage: record.inviteMessage ?? '',
  };
};

const newSection = (id: string, sectionType: SectionType): BuilderSection => ({
  id,
  isNew: true,
  sectionType,
  position: 0,
  isVisible: true,
  eyebrow: '',
  heading: '',
  text: '',
  photo: null,
  primaryButton:
    sectionType === 'HERO' || sectionType === 'GIVE' || sectionType === 'THANKS'
      ? { label: 'Give', action: 'GIVE', url: '' }
      : EMPTY_BUTTON,
  secondaryButton: EMPTY_BUTTON,
  trustLine: '',
  badgeValue: '',
  badgeText: '',
  items: [],
  smallPrint: '',
  inviteMessage: '',
});

const withId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids : [...ids, id];

const withoutId = (ids: string[], id: string): string[] =>
  ids.filter((existing) => existing !== id);

const markDirty = (state: BuilderState, id: string): BuilderState => ({
  ...state,
  dirtyIds: withId(state.dirtyIds, id),
  versions: { ...state.versions, [id]: (state.versions[id] ?? 0) + 1 },
});

// Renumbers to 0..n and marks every section whose position moved as dirty.
const withSections = (
  state: BuilderState,
  sections: BuilderSection[],
): BuilderState => {
  let next = state;

  const renumbered = sections.map((section, index) => {
    if (section.position === index) {
      return section;
    }
    next = markDirty(next, section.id);

    return { ...section, position: index };
  });

  return { ...next, sections: renumbered };
};

const sortRecords = (records: LandingPageSectionRecord[]) =>
  [...records].sort(
    (first, second) =>
      (first.position ?? Number.MAX_SAFE_INTEGER) -
        (second.position ?? Number.MAX_SAFE_INTEGER) ||
      first.id.localeCompare(second.id),
  );

export const createBuilderState = (
  records: LandingPageSectionRecord[],
  selectedId: string | null = null,
): BuilderState => {
  const sorted = sortRecords(records);
  const sections = sorted.map(toBuilderSection);
  const keepsSelection = sections.some((section) => section.id === selectedId);
  // A stored position that differs from its index must be written back, or a partial save can swap rows.
  const dirtyIds = sorted
    .filter((record, index) => record.position !== index)
    .map((record) => record.id);

  return {
    sections,
    selectedId: keepsSelection ? selectedId : (sections[0]?.id ?? null),
    dirtyIds,
    removedIds: [],
    versions: Object.fromEntries(dirtyIds.map((id) => [id, 1])),
  };
};

// Sections still dirty after every commit changed while the save ran, so their local copy wins.
const mergeReload = (
  state: BuilderState,
  records: LandingPageSectionRecord[],
): BuilderState => {
  const loaded = createBuilderState(records, state.selectedId);
  const localById = new Map(
    state.sections
      .filter((section) => state.dirtyIds.includes(section.id))
      .map((section) => [section.id, section]),
  );

  if (localById.size === 0 && state.removedIds.length === 0) {
    return loaded;
  }

  const sections = loaded.sections
    .filter((section) => !state.removedIds.includes(section.id))
    .map((section) => localById.get(section.id) ?? section);

  for (const local of localById.values()) {
    if (!sections.some((section) => section.id === local.id)) {
      sections.push(local);
    }
  }

  const versions = { ...loaded.versions };

  for (const id of localById.keys()) {
    versions[id] = state.versions[id] ?? 1;
  }

  const next = withSections(
    {
      ...loaded,
      dirtyIds: [...new Set([...loaded.dirtyIds, ...localById.keys()])],
      removedIds: state.removedIds,
      versions,
    },
    sections,
  );
  const keepsSelection = next.sections.some((section) => section.id === state.selectedId);

  return {
    ...next,
    selectedId: keepsSelection ? state.selectedId : (next.sections[0]?.id ?? null),
  };
};

const hasType = (state: BuilderState, sectionType: SectionType): boolean =>
  state.sections.some((section) => section.sectionType === sectionType);

export const canAddType = (
  state: BuilderState,
  sectionType: SectionType,
): boolean => !SINGLE_USE_TYPES.includes(sectionType) || !hasType(state, sectionType);

const clearIfUnchanged = (
  state: BuilderState,
  id: string,
  version: number,
): BuilderState =>
  (state.versions[id] ?? 0) === version
    ? { ...state, dirtyIds: withoutId(state.dirtyIds, id) }
    : state;

export const builderReducer = (
  state: BuilderState,
  action: BuilderAction,
): BuilderState => {
  switch (action.type) {
    case 'select':
      return { ...state, selectedId: action.id };

    case 'edit': {
      if (!state.sections.some((section) => section.id === action.id)) {
        return state;
      }

      return {
        ...markDirty(state, action.id),
        sections: state.sections.map((section) =>
          section.id === action.id ? { ...section, ...action.patch } : section,
        ),
      };
    }

    case 'toggleVisible': {
      const section = state.sections.find((entry) => entry.id === action.id);

      return section === undefined
        ? state
        : builderReducer(state, {
            type: 'edit',
            id: action.id,
            patch: { isVisible: !section.isVisible },
          });
    }

    case 'add': {
      if (!canAddType(state, action.sectionType)) {
        return state;
      }
      const next = withSections(markDirty(state, action.id), [
        ...state.sections,
        newSection(action.id, action.sectionType),
      ]);

      return { ...next, selectedId: action.id };
    }

    case 'duplicate': {
      const index = state.sections.findIndex((section) => section.id === action.id);
      const original = state.sections[index];

      if (original === undefined || SINGLE_USE_TYPES.includes(original.sectionType)) {
        return state;
      }
      // A file can belong to only one record, so the copy starts without the photo.
      const copy: BuilderSection = {
        ...original,
        id: action.newId,
        isNew: true,
        photo: null,
        items: original.items.map((item) => ({ ...item })),
      };
      const sections = [...state.sections];

      sections.splice(index + 1, 0, copy);
      const next = withSections(markDirty(state, action.newId), sections);

      return { ...next, selectedId: action.newId };
    }

    case 'remove': {
      const index = state.sections.findIndex((section) => section.id === action.id);
      const removed = state.sections[index];

      if (removed === undefined) {
        return state;
      }
      const remaining = state.sections.filter((section) => section.id !== action.id);
      const next = withSections(
        {
          ...state,
          dirtyIds: withoutId(state.dirtyIds, action.id),
          removedIds: removed.isNew
            ? state.removedIds
            : withId(state.removedIds, action.id),
        },
        remaining,
      );
      const selectedId =
        state.selectedId === action.id
          ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
          : state.selectedId;

      return { ...next, selectedId };
    }

    case 'move': {
      const fromIndex = state.sections.findIndex((section) => section.id === action.id);

      if (
        fromIndex === -1 ||
        action.toIndex < 0 ||
        action.toIndex >= state.sections.length ||
        action.toIndex === fromIndex
      ) {
        return state;
      }
      const sections = [...state.sections];
      const [moved] = sections.splice(fromIndex, 1);

      sections.splice(action.toIndex, 0, moved);

      return withSections(state, sections);
    }

    case 'loaded':
      return createBuilderState(action.records);

    case 'saved':
      return mergeReload(state, action.records);

    case 'committed': {
      let next = state;
      const { created, updated, deletedId } = action;

      // Removed while its create ran: the server copy must be deleted on the next save.
      if (
        created !== undefined &&
        !next.sections.some((section) => section.id === created.temporaryId)
      ) {
        const versions = { ...next.versions };

        delete versions[created.temporaryId];
        next = {
          ...next,
          dirtyIds: withoutId(next.dirtyIds, created.temporaryId),
          removedIds: withId(next.removedIds, created.id),
          versions,
        };
      } else if (created !== undefined) {
        const { [created.temporaryId]: version = 0, ...versions } = next.versions;

        next = clearIfUnchanged(
          {
            ...next,
            sections: next.sections.map((section) =>
              section.id === created.temporaryId
                ? { ...section, id: created.id, isNew: false }
                : section,
            ),
            selectedId:
              next.selectedId === created.temporaryId ? created.id : next.selectedId,
            dirtyIds: next.dirtyIds.map((id) =>
              id === created.temporaryId ? created.id : id,
            ),
            versions: { ...versions, [created.id]: version },
          },
          created.id,
          created.version,
        );
      }
      if (updated !== undefined) {
        next = clearIfUnchanged(next, updated.id, updated.version);
      }
      if (deletedId !== undefined) {
        next = { ...next, removedIds: withoutId(next.removedIds, deletedId) };
      }

      return next;
    }
  }
};

export const hasUnsavedChanges = (state: BuilderState): boolean =>
  state.dirtyIds.length > 0 || state.removedIds.length > 0;

const toButtonFields = (button: ButtonDraft) => ({
  label: button.label.trim(),
  action: button.label.trim() === '' ? null : button.action,
  url: { primaryLinkUrl: button.action === 'LINK' ? button.url.trim() : '' },
});

export const toSectionPayload = (section: BuilderSection): SectionPayload => {
  const isForm = section.sectionType === 'JOIN' || section.sectionType === 'VOLUNTEER';
  // The public page reads a form label only when its action is set.
  const primary = isForm
    ? {
        label: section.primaryButton.label.trim(),
        action: section.sectionType as ButtonAction,
        url: { primaryLinkUrl: '' },
      }
    : toButtonFields(section.primaryButton);
  const secondary = toButtonFields(section.secondaryButton);
  const itemFields = ITEM_FIELDS_BY_TYPE[section.sectionType];

  return {
    sectionType: section.sectionType,
    position: section.position,
    isVisible: section.isVisible,
    eyebrow: section.eyebrow,
    heading: section.heading,
    text: section.text,
    photo: section.photo
      ? [{ fileId: section.photo.fileId, label: section.photo.label }]
      : [],
    primaryButtonLabel: primary.label,
    primaryButtonAction: primary.action,
    primaryButtonUrl: primary.url,
    secondaryButtonLabel: secondary.label,
    secondaryButtonAction: secondary.action,
    secondaryButtonUrl: secondary.url,
    trustLine: section.trustLine,
    badgeValue: section.badgeValue,
    badgeText: section.badgeText,
    items: section.items.map((item) =>
      Object.fromEntries(itemFields.map((field) => [field, item[field]])),
    ),
    smallPrint: section.smallPrint,
    inviteMessage: section.inviteMessage,
  };
};

export const describeSection = (section: BuilderSection): string => {
  const typeLabel = SECTION_TYPE_LABELS[section.sectionType];
  const heading = section.heading.trim();

  return heading === '' ? typeLabel : `${typeLabel} "${heading}"`;
};

export type SectionProblem = { sectionId: string; message: string };

export const listSectionProblems = (sections: BuilderSection[]): SectionProblem[] => {
  const problems: SectionProblem[] = [];

  for (const section of sections) {
    const fields = FIELDS_BY_TYPE[section.sectionType];
    const buttons: [ButtonDraft, string][] = [];
    const add = (message: string) =>
      problems.push({ sectionId: section.id, message: `${describeSection(section)}: ${message}` });

    if (fields.includes('primaryButton')) {
      buttons.push([section.primaryButton, 'the main button']);
    }
    if (fields.includes('secondaryButton')) {
      buttons.push([section.secondaryButton, 'the second button']);
    }
    for (const [button, name] of buttons) {
      if (button.label.trim() !== '' && button.action === null) {
        add(`pick what ${name} does`);
      }
      if (
        button.label.trim() !== '' &&
        button.action === 'LINK' &&
        !isHttpsUrl(button.url.trim())
      ) {
        add(`${name} link must start with https://`);
      }
    }
    if (
      section.sectionType === 'THANKS' &&
      section.primaryButton.label.trim() !== '' &&
      section.primaryButton.action !== null &&
      section.primaryButton.action !== 'GIVE'
    ) {
      add('The thank-you screen button must be Give.');
    }
  }

  return problems;
};

export const findSectionProblems = (sections: BuilderSection[]): string[] =>
  listSectionProblems(sections).map((problem) => problem.message);

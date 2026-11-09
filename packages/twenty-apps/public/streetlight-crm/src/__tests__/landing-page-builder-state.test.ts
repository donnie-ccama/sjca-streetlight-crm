import { describe, expect, it } from 'vitest';

import {
  builderReducer,
  createBuilderState,
  findSectionProblems,
  hasUnsavedChanges,
  toSectionPayload,
  type BuilderState,
} from 'src/front-components/landing-page-builder/use-builder-state';
import type { LandingPageSectionRecord } from 'src/shared/marketing/sections';

const makeRecord = (
  overrides: Partial<LandingPageSectionRecord> = {},
): LandingPageSectionRecord => ({
  id: 'section-1',
  sectionType: 'HERO',
  position: 0,
  isVisible: true,
  eyebrow: null,
  heading: null,
  text: null,
  photo: null,
  primaryButtonLabel: null,
  primaryButtonAction: null,
  primaryButtonUrl: null,
  secondaryButtonLabel: null,
  secondaryButtonAction: null,
  secondaryButtonUrl: null,
  trustLine: null,
  badgeValue: null,
  badgeText: null,
  items: null,
  smallPrint: null,
  inviteMessage: null,
  ...overrides,
});

const threeSections = (): BuilderState =>
  createBuilderState([
    makeRecord({ id: 'a', sectionType: 'HERO', position: 0 }),
    makeRecord({ id: 'b', sectionType: 'STATS', position: 1 }),
    makeRecord({ id: 'c', sectionType: 'JOIN', position: 2 }),
  ]);

const orderOf = (state: BuilderState) =>
  state.sections.map((section) => [section.id, section.position]);

describe('createBuilderState', () => {
  it('sorts by position, renumbers, and selects the first section', () => {
    const state = createBuilderState([
      makeRecord({ id: 'b', position: 7 }),
      makeRecord({ id: 'a', position: 2 }),
    ]);

    expect(orderOf(state)).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(state.selectedId).toBe('a');
  });

  it('marks a section dirty when its stored position differs from its index', () => {
    const state = createBuilderState([
      makeRecord({ id: 'a', position: 5 }),
      makeRecord({ id: 'b', position: 1 }),
      makeRecord({ id: 'c', position: 6 }),
    ]);

    expect(orderOf(state)).toEqual([
      ['b', 0],
      ['a', 1],
      ['c', 2],
    ]);
    expect([...state.dirtyIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('has no unsaved changes when stored positions already run 0..n', () => {
    expect(hasUnsavedChanges(threeSections())).toBe(false);
  });
});

describe('builderReducer', () => {
  it('move renumbers positions as 0, 1, 2', () => {
    const state = builderReducer(threeSections(), {
      type: 'move',
      id: 'c',
      toIndex: 0,
    });

    expect(orderOf(state)).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect([...state.dirtyIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('move outside the list changes nothing', () => {
    const before = threeSections();

    expect(builderReducer(before, { type: 'move', id: 'a', toIndex: -1 })).toBe(
      before,
    );
  });

  it('remove of an unsaved section leaves no delete', () => {
    const added = builderReducer(threeSections(), {
      type: 'add',
      id: 'new-1',
      sectionType: 'STORY',
    });
    const removed = builderReducer(added, { type: 'remove', id: 'new-1' });

    expect(removed.removedIds).toEqual([]);
    expect(removed.dirtyIds).not.toContain('new-1');
    expect(hasUnsavedChanges(removed)).toBe(false);
  });

  it('remove of a saved section records a delete and renumbers', () => {
    const state = builderReducer(threeSections(), { type: 'remove', id: 'a' });

    expect(state.removedIds).toEqual(['a']);
    expect(orderOf(state)).toEqual([
      ['b', 0],
      ['c', 1],
    ]);
    expect(state.selectedId).toBe('b');
  });

  it('edit marks only that id dirty', () => {
    const state = builderReducer(threeSections(), {
      type: 'edit',
      id: 'b',
      patch: { heading: 'Numbers' },
    });

    expect(state.dirtyIds).toEqual(['b']);
    expect(state.sections[1].heading).toBe('Numbers');
  });

  it('saved replaces sections and clears the dirty and removed sets', () => {
    let state = builderReducer(threeSections(), { type: 'remove', id: 'a' });
    state = builderReducer(state, {
      type: 'edit',
      id: 'b',
      patch: { heading: 'Changed' },
    });
    const snapshot = state;

    for (const id of snapshot.dirtyIds) {
      state = builderReducer(state, {
        type: 'committed',
        updated: { id, version: snapshot.versions[id] },
      });
    }
    state = builderReducer(state, { type: 'committed', deletedId: 'a' });

    const saved = builderReducer(state, {
      type: 'saved',
      records: [makeRecord({ id: 'b', heading: 'Changed', position: 0 })],
    });

    expect(saved.dirtyIds).toEqual([]);
    expect(saved.removedIds).toEqual([]);
    expect(saved.sections.map((section) => section.id)).toEqual(['b']);
    expect(saved.selectedId).toBe('b');
  });

  it('add of a second JOIN is refused', () => {
    const before = threeSections();
    const state = builderReducer(before, {
      type: 'add',
      id: 'new-1',
      sectionType: 'JOIN',
    });

    expect(state).toBe(before);
  });

  it('add appends a new section, selects it, and marks it dirty', () => {
    const state = builderReducer(threeSections(), {
      type: 'add',
      id: 'new-1',
      sectionType: 'VOLUNTEER',
    });

    expect(orderOf(state)[3]).toEqual(['new-1', 3]);
    expect(state.sections[3].isNew).toBe(true);
    expect(state.selectedId).toBe('new-1');
    expect(state.dirtyIds).toEqual(['new-1']);
  });

  it('duplicate inserts a copy after the original without its photo', () => {
    const start = createBuilderState([
      makeRecord({
        id: 'a',
        heading: 'Hello',
        photo: [{ fileId: 'file-1', label: 'Kids', url: 'https://x' }],
      }),
      makeRecord({ id: 'b', sectionType: 'STATS', position: 1 }),
    ]);
    const state = builderReducer(start, {
      type: 'duplicate',
      id: 'a',
      newId: 'new-1',
    });

    expect(orderOf(state)).toEqual([
      ['a', 0],
      ['new-1', 1],
      ['b', 2],
    ]);
    expect(state.sections[1].heading).toBe('Hello');
    expect(state.sections[1].photo).toBeNull();
    expect(state.selectedId).toBe('new-1');
  });

  it('duplicate of a JOIN section is refused', () => {
    const before = threeSections();

    expect(
      builderReducer(before, { type: 'duplicate', id: 'c', newId: 'new-1' }),
    ).toBe(before);
  });

  it('toggleVisible flips visibility and marks dirty', () => {
    const state = builderReducer(threeSections(), {
      type: 'toggleVisible',
      id: 'a',
    });

    expect(state.sections[0].isVisible).toBe(false);
    expect(state.dirtyIds).toEqual(['a']);
  });

  it('committed after a create swaps the temporary id for the real one', () => {
    const added = builderReducer(threeSections(), {
      type: 'add',
      id: 'new-1',
      sectionType: 'STORY',
    });
    const state = builderReducer(added, {
      type: 'committed',
      created: { temporaryId: 'new-1', id: 'real-1', version: added.versions['new-1'] },
    });

    expect(state.sections[3]).toMatchObject({ id: 'real-1', isNew: false });
    expect(state.selectedId).toBe('real-1');
    expect(state.dirtyIds).toEqual([]);
  });

  it('marks a section created after its local copy was removed for deletion', () => {
    const added = builderReducer(threeSections(), {
      type: 'add',
      id: 'new-1',
      sectionType: 'STORY',
    });
    const version = added.versions['new-1'];
    const removed = builderReducer(added, { type: 'remove', id: 'new-1' });
    const state = builderReducer(removed, {
      type: 'committed',
      created: { temporaryId: 'new-1', id: 'real-1', version },
    });

    expect(state.removedIds).toEqual(['real-1']);
    expect(state.sections.some((section) => section.id === 'real-1')).toBe(false);

    const reloaded = builderReducer(state, {
      type: 'saved',
      records: [
        makeRecord({ id: 'a', sectionType: 'HERO', position: 0 }),
        makeRecord({ id: 'real-1', sectionType: 'STORY', position: 3 }),
      ],
    });

    expect(reloaded.sections.some((section) => section.id === 'real-1')).toBe(false);
    expect(reloaded.removedIds).toEqual(['real-1']);
  });

  it('committed after an update and a delete clears only those ids', () => {
    let state = builderReducer(threeSections(), { type: 'remove', id: 'a' });
    state = builderReducer(state, {
      type: 'edit',
      id: 'b',
      patch: { heading: 'x' },
    });
    state = builderReducer(state, { type: 'committed', deletedId: 'a' });

    expect(state.removedIds).toEqual([]);
    expect(state.dirtyIds).toContain('b');
  });
});

describe('an edit that lands while a save runs', () => {
  it('stays dirty after its update commits and keeps its local copy on reload', () => {
    let state = builderReducer(threeSections(), {
      type: 'edit',
      id: 'a',
      patch: { heading: 'First' },
    });
    const snapshot = state;

    // A photo upload finishes after Save took its snapshot.
    state = builderReducer(state, {
      type: 'edit',
      id: 'a',
      patch: { photo: { fileId: 'file-9', label: '', url: null } },
    });
    state = builderReducer(state, {
      type: 'committed',
      updated: { id: 'a', version: snapshot.versions.a },
    });

    expect(state.dirtyIds).toEqual(['a']);

    state = builderReducer(state, {
      type: 'saved',
      records: [
        makeRecord({ id: 'a', heading: 'First', position: 0 }),
        makeRecord({ id: 'b', sectionType: 'STATS', position: 1 }),
        makeRecord({ id: 'c', sectionType: 'JOIN', position: 2 }),
      ],
    });

    expect(state.dirtyIds).toEqual(['a']);
    expect(state.sections[0].photo?.fileId).toBe('file-9');
    expect(hasUnsavedChanges(state)).toBe(true);
  });

  it('stays dirty under its real id when a create commits', () => {
    let state = builderReducer(threeSections(), {
      type: 'add',
      id: 'new-1',
      sectionType: 'STORY',
    });
    const snapshot = state;

    state = builderReducer(state, {
      type: 'edit',
      id: 'new-1',
      patch: { heading: 'Late' },
    });
    state = builderReducer(state, {
      type: 'committed',
      created: { temporaryId: 'new-1', id: 'real-1', version: snapshot.versions['new-1'] },
    });

    expect(state.dirtyIds).toEqual(['real-1']);
    expect(state.sections[3]).toMatchObject({ id: 'real-1', isNew: false, heading: 'Late' });
  });
});

describe('loaded', () => {
  it('replaces all state, dropping edits from another page', () => {
    const edited = builderReducer(threeSections(), {
      type: 'edit',
      id: 'a',
      patch: { heading: 'x' },
    });
    const state = builderReducer(edited, {
      type: 'loaded',
      records: [makeRecord({ id: 'z', position: 0 })],
    });

    expect(state.sections.map((section) => section.id)).toEqual(['z']);
    expect(hasUnsavedChanges(state)).toBe(false);
  });
});

describe('extra items', () => {
  it('keeps items beyond the type limit and writes them back unchanged', () => {
    const items = [1, 2, 3, 4, 5].map((index) => ({ value: `${index}`, label: '' }));
    const state = createBuilderState([makeRecord({ sectionType: 'STATS', items })]);

    expect(state.sections[0].items).toHaveLength(5);
    expect(toSectionPayload(state.sections[0]).items).toEqual(items);
  });
});

describe('toSectionPayload', () => {
  it('writes the form label with the section type as its action', () => {
    const state = createBuilderState([
      makeRecord({ id: 'c', sectionType: 'JOIN', primaryButtonLabel: 'Pray' }),
    ]);

    expect(toSectionPayload(state.sections[0])).toMatchObject({
      primaryButtonLabel: 'Pray',
      primaryButtonAction: 'JOIN',
    });
  });

  it('writes the URL only for a LINK button and the photo as fileId and label', () => {
    const state = createBuilderState([
      makeRecord({
        primaryButtonLabel: 'Give',
        primaryButtonAction: 'GIVE',
        primaryButtonUrl: { primaryLinkUrl: 'https://old.example' },
        secondaryButtonLabel: 'More',
        secondaryButtonAction: 'LINK',
        secondaryButtonUrl: { primaryLinkUrl: 'https://more.example' },
        photo: [{ fileId: 'file-1', label: 'Kids', url: 'https://signed' }],
      }),
    ]);
    const payload = toSectionPayload(state.sections[0]);

    expect(payload.primaryButtonUrl).toEqual({ primaryLinkUrl: '' });
    expect(payload.secondaryButtonUrl).toEqual({
      primaryLinkUrl: 'https://more.example',
    });
    expect(payload.photo).toEqual([{ fileId: 'file-1', label: 'Kids' }]);
  });

  it('writes items in the shape of the section type', () => {
    const state = createBuilderState([
      makeRecord({
        sectionType: 'GIVE',
        items: [{ amount: '$25', title: 'A week', text: 'Meals', featured: true }],
      }),
    ]);

    expect(toSectionPayload(state.sections[0]).items).toEqual([
      { amount: '$25', title: 'A week', text: 'Meals', featured: true },
    ]);
  });
});

describe('findSectionProblems', () => {
  it('reports a button with text but no action', () => {
    const state = createBuilderState([
      makeRecord({ heading: 'Top', primaryButtonLabel: 'Go', primaryButtonAction: null }),
    ]);

    expect(findSectionProblems(state.sections)).toEqual([
      'Top banner (Hero) "Top": pick what the main button does',
    ]);
  });

  it('reports a link button without an https address', () => {
    const state = createBuilderState([
      makeRecord({
        heading: 'Top',
        primaryButtonLabel: 'Read',
        primaryButtonAction: 'LINK',
        primaryButtonUrl: { primaryLinkUrl: 'http://insecure.example' },
      }),
    ]);

    expect(findSectionProblems(state.sections)).toEqual([
      'Top banner (Hero) "Top": the main button link must start with https://',
    ]);
  });
});

describe('THANKS and INVITE sections', () => {
  it('sends the invite message and the invite button label', () => {
    const state = createBuilderState([
      makeRecord({
        id: 'invite',
        sectionType: 'INVITE',
        primaryButtonLabel: 'Invite {friend}',
        inviteMessage: '{friend}, look at this.',
      }),
    ]);

    expect(toSectionPayload(state.sections[0])).toMatchObject({
      primaryButtonLabel: 'Invite {friend}',
      inviteMessage: '{friend}, look at this.',
    });
  });

  it('keeps only the amount on THANKS items', () => {
    const state = createBuilderState([
      makeRecord({
        id: 'thanks',
        sectionType: 'THANKS',
        items: [{ amount: '15', title: 'Stray' }],
      }),
    ]);

    expect(toSectionPayload(state.sections[0]).items).toEqual([{ amount: '15' }]);
  });

  it('allows one THANKS and one INVITE section', () => {
    const once = builderReducer(
      builderReducer(createBuilderState([]), { type: 'add', id: 'n1', sectionType: 'THANKS' }),
      { type: 'add', id: 'n2', sectionType: 'INVITE' },
    );
    const twice = builderReducer(
      builderReducer(once, { type: 'add', id: 'n3', sectionType: 'THANKS' }),
      { type: 'add', id: 'n4', sectionType: 'INVITE' },
    );

    expect(twice.sections.map((section) => section.id)).toEqual(['n1', 'n2']);
  });

  it('says the THANKS button must be Give', () => {
    const state = createBuilderState([
      makeRecord({
        id: 'thanks',
        sectionType: 'THANKS',
        heading: 'Thank you',
        primaryButtonLabel: 'Join',
        primaryButtonAction: 'JOIN',
      }),
    ]);

    expect(findSectionProblems(state.sections)).toEqual([
      'Thank-you screen "Thank you": The thank-you screen button must be Give.',
    ]);
  });

  it('finds no problem with a Give button on THANKS', () => {
    const state = createBuilderState([
      makeRecord({
        id: 'thanks',
        sectionType: 'THANKS',
        primaryButtonLabel: 'Give',
        primaryButtonAction: 'GIVE',
      }),
    ]);

    expect(findSectionProblems(state.sections)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import landingPageLayout from 'src/page-layouts/landing-page.page-layout';
import {
  LANDING_PAGE_BUILDER_FRONT_COMPONENT_ID,
  LANDING_PAGE_RESULTS_TAB_ID,
} from 'src/constants/marketing-identifiers';
import { DEFAULT_INVITE_MESSAGE } from 'src/shared/marketing/sections';
import { buildStarterSections } from 'src/shared/marketing/starter-sections';

describe('buildStarterSections', () => {
  const types = (pageType: 'ONE_STEP' | 'TWO_STEP') =>
    buildStarterSections('page-1', pageType).map(
      (section) => section.sectionType,
    );

  it('builds the One-Step sections in order', () => {
    const sections = buildStarterSections('page-1', 'ONE_STEP');

    expect(types('ONE_STEP')).toEqual([
      'HERO',
      'STATS',
      'GIVE',
      'QUOTE',
      'INVITE',
      'JOIN',
    ]);
    expect(sections.map((section) => section.position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(
      sections.every((section) => section.landingPageId === 'page-1'),
    ).toBe(true);
    expect(sections[0].primaryButtonAction).toBe('GIVE');
    expect(sections[0].secondaryButtonLabel).toBeUndefined();
    expect(sections[0].secondaryButtonAction).toBeUndefined();
    expect(sections[5].heading).toBe('Not ready to give? Pray with us.');
    expect(sections[4]).toMatchObject({
      heading: 'Invite a friend',
      primaryButtonLabel: 'Invite {friend}',
      inviteMessage: DEFAULT_INVITE_MESSAGE,
    });
  });

  it('builds the Two-Step sections in order', () => {
    const sections = buildStarterSections('page-1', 'TWO_STEP');

    expect(types('TWO_STEP')).toEqual([
      'HERO',
      'JOIN',
      'STORY',
      'STATS',
      'QUOTE',
      'THANKS',
      'INVITE',
    ]);
    expect(sections.map((section) => section.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(sections[0].primaryButtonAction).toBe('JOIN');
    expect(sections[0].secondaryButtonAction).toBeUndefined();
    expect(sections[5]).toMatchObject({
      primaryButtonLabel: 'Give',
      primaryButtonAction: 'GIVE',
      smallPrint: 'No thanks, maybe later',
      items: [{ amount: '15' }, { amount: '25' }, { amount: '50' }],
    });
    expect(sections[6].inviteMessage).toBe(DEFAULT_INVITE_MESSAGE);
  });

  it('uses no Citykid text', () => {
    for (const pageType of ['ONE_STEP', 'TWO_STEP'] as const) {
      expect(
        JSON.stringify(buildStarterSections('page-1', pageType)).toLowerCase(),
      ).not.toContain('citykid');
    }
  });
});

describe('landing page layout', () => {
  const { config } = landingPageLayout;

  it('does not pin the first tab', () => {
    expect(config.isFirstTabPinned).toBe(false);
  });

  it('puts a full-height builder tab before results', () => {
    const [builderTab, resultsTab] = config.tabs ?? [];

    expect(builderTab.position).toBe(0);
    expect(builderTab.layoutMode).toBe('VERTICAL_LIST');
    expect(builderTab.widgets?.[0].heightBehavior).toBe('TAB_VIEWPORT');
    expect(builderTab.widgets?.[0].configuration).toMatchObject({
      frontComponentUniversalIdentifier:
        LANDING_PAGE_BUILDER_FRONT_COMPONENT_ID,
    });
    expect(resultsTab.universalIdentifier).toBe(LANDING_PAGE_RESULTS_TAB_ID);
    expect(resultsTab.position).toBe(1);
  });
});

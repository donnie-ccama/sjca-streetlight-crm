import type { LandingPageSectionCreateInput } from 'src/shared/marketing/sections';

export type LegacyLandingPage = {
  id: string;
  status: string;
  headline: string | null;
  bodyMarkdown: string | null;
  giveLabel: string | null;
  prayLabel: string | null;
  volunteerLabel: string | null;
  hasHeroImage: boolean;
};

const stripMarkdown = (markdown: string): string =>
  markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*)/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

const toParagraphs = (markdown: string | null): string[] =>
  (markdown ?? '')
    .split(/\n\s*\n/)
    .map(stripMarkdown)
    .filter((paragraph) => paragraph !== '');

const clean = (value: string | null): string => (value ?? '').trim();

export const planMigration = (
  page: LegacyLandingPage,
): LandingPageSectionCreateInput[] => {
  const landingPageId = page.id;
  const [firstParagraph = '', ...otherParagraphs] = toParagraphs(
    page.bodyMarkdown,
  );
  const prayLabel = clean(page.prayLabel);
  const volunteerLabel = clean(page.volunteerLabel);
  const sections: Omit<
    LandingPageSectionCreateInput,
    'landingPageId' | 'position'
  >[] = [
    {
      sectionType: 'HERO',
      heading: clean(page.headline),
      text: firstParagraph,
      primaryButtonLabel: clean(page.giveLabel) || 'Give',
      primaryButtonAction: 'GIVE' as const,
      ...(prayLabel !== ''
        ? {
            secondaryButtonLabel: 'Join the list',
            secondaryButtonAction: 'JOIN' as const,
          }
        : {}),
    },
  ];

  if (otherParagraphs.length > 0) {
    sections.push({ sectionType: 'STORY', text: otherParagraphs.join('\n\n') });
  }

  if (prayLabel !== '') {
    sections.push({
      sectionType: 'JOIN',
      heading: prayLabel,
      primaryButtonLabel: prayLabel,
      primaryButtonAction: 'JOIN',
    });
  }

  if (volunteerLabel !== '') {
    sections.push({
      sectionType: 'VOLUNTEER',
      heading: volunteerLabel,
      primaryButtonLabel: volunteerLabel,
      primaryButtonAction: 'VOLUNTEER',
    });
  }

  return sections.map((section, position) => ({
    landingPageId,
    position,
    ...section,
  }));
};

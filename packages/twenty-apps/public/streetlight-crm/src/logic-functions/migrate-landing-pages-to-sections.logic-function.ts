import { definePostInstallLogicFunction } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';

import { MIGRATE_LANDING_PAGES_LOGIC_FUNCTION_ID } from 'src/constants/marketing-identifiers';
import { publishLandingPage } from 'src/logic-functions/landing-page-publish.server';
import { gql } from 'src/logic-functions/workspace-gql';
import {
  planMigration,
  type LegacyLandingPage,
} from 'src/shared/marketing/migrate-landing-page';

const PAGE_SIZE = 100;

const LIST_PAGES = `
  query ListLandingPages($first: Int!, $after: String) {
    landingPages(first: $first, after: $after) {
      edges {
        node {
          id status headline body { markdown } heroImage { fileId }
          giveLabel prayLabel volunteerLabel
          publishedContent publishedAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const COUNT_SECTIONS = `
  query CountSections($landingPageId: UUID!) {
    landingPageSections(filter: { landingPageId: { eq: $landingPageId } }, first: 1) {
      edges { node { id } }
    }
  }
`;

const CREATE_SECTIONS = `
  mutation CreateSections($data: [LandingPageSectionCreateInput!]!) {
    createLandingPageSections(data: $data) { id }
  }
`;

type LandingPageNode = {
  id: string;
  status?: string | null;
  headline?: string | null;
  body?: { markdown?: string | null } | null;
  heroImage?: unknown[] | null;
  giveLabel?: string | null;
  prayLabel?: string | null;
  volunteerLabel?: string | null;
  publishedContent?: unknown;
  publishedAt?: string | null;
};

type ListedPage = LegacyLandingPage & { neverPublished: boolean };

const toLegacyPage = (node: LandingPageNode): ListedPage => ({
  neverPublished:
    (node.publishedContent ?? null) === null &&
    (node.publishedAt ?? null) === null,
  id: node.id,
  status: node.status ?? '',
  headline: node.headline ?? null,
  bodyMarkdown: node.body?.markdown ?? null,
  giveLabel: node.giveLabel ?? null,
  prayLabel: node.prayLabel ?? null,
  volunteerLabel: node.volunteerLabel ?? null,
  hasHeroImage: Array.isArray(node.heroImage) && node.heroImage.length > 0,
});

const listPages = async (): Promise<ListedPage[]> => {
  const pages: ListedPage[] = [];
  let after: string | null = null;

  for (;;) {
    const data = await gql(LIST_PAGES, {
      first: PAGE_SIZE,
      after,
    });
    const connection = data.landingPages;

    for (const edge of connection?.edges ?? []) {
      pages.push(toLegacyPage(edge.node));
    }

    if (connection?.pageInfo?.hasNextPage !== true) return pages;

    after = connection.pageInfo.endCursor;
  }
};

export const migrateLandingPages = async () => {
  const counts = { migrated: 0, skipped: 0, published: 0, failed: 0 };

  const publish = async (page: ListedPage) => {
    const result = await publishLandingPage({
      landingPageId: page.id,
      publishedById: null,
    });

    if (result.status === 200) {
      counts.published += 1;
    } else {
      counts.failed += 1;
      console.error(
        `landing page ${page.id} not published: status ${result.status}`,
      );
    }
  };

  for (const page of await listPages()) {
    try {
      // Staff own a published page, even one they emptied of sections.
      if (!page.neverPublished) {
        counts.skipped += 1;
        continue;
      }

      const existing = await gql(COUNT_SECTIONS, { landingPageId: page.id });

      if ((existing.landingPageSections?.edges?.length ?? 0) > 0) {
        counts.skipped += 1;

        // Retry a publish that failed on an earlier run, only for pages this step migrated.
        if (
          page.status === 'LIVE' &&
          (await kv.get<boolean>(`migrated:${page.id}`)) === true
        ) {
          await publish(page);
        }

        continue;
      }

      await kv.set(`migrated:${page.id}`, true);
      // Set before creating so the landingPage.created trigger never adds starters.
      await kv.set(`starter-sections:${page.id}`, true);

      try {
        await gql(CREATE_SECTIONS, { data: planMigration(page) });
      } catch (error) {
        await kv.delete(`starter-sections:${page.id}`);
        await kv.delete(`migrated:${page.id}`);
        throw error;
      }

      counts.migrated += 1;

      if (page.hasHeroImage) {
        console.log(
          `landing page ${page.id}: hero image not moved, re-upload in the builder`,
        );
      }

      if (page.status === 'LIVE') await publish(page);
    } catch (error) {
      counts.failed += 1;
      console.error(
        `landing page ${page.id} migration failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  return counts;
};

export default definePostInstallLogicFunction({
  universalIdentifier: MIGRATE_LANDING_PAGES_LOGIC_FUNCTION_ID,
  name: 'migrate-landing-pages-to-sections',
  description:
    'Moves never-published landing pages that have no sections to section records and publishes each migrated live page once. Safe to run again.',
  timeoutSeconds: 300,
  shouldRunOnVersionUpgrade: true,
  handler: migrateLandingPages,
});

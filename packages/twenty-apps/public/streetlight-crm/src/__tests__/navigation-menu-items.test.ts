import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import campaigns from 'src/navigation-menu-items/campaigns.navigation-menu-item';
import donations from 'src/navigation-menu-items/donations.navigation-menu-item';
import funds from 'src/navigation-menu-items/funds.navigation-menu-item';
import fundraisingCampaigns from 'src/navigation-menu-items/fundraising-campaigns.navigation-menu-item';
import landingPages from 'src/navigation-menu-items/landing-pages.navigation-menu-item';
import socialPosts from 'src/navigation-menu-items/marketing.navigation-menu-item';
import households from 'src/navigation-menu-items/households.navigation-menu-item';
import pledges from 'src/navigation-menu-items/pledges.navigation-menu-item';
import donationObject from 'src/objects/donation.object';
import fundObject from 'src/objects/fund.object';
import fundraisingCampaignObject from 'src/objects/fundraising-campaign.object';
import householdObject from 'src/objects/household.object';
import landingPageObject from 'src/objects/landing-page.object';
import pledgeObject from 'src/objects/pledge.object';
import socialPostObject from 'src/objects/social-post.object';

// Each target comes from the object definition, not from the constant the item
// imports, so a wrong constant in an item fails here.
const items = [
  { item: donations, target: donationObject.config.universalIdentifier },
  { item: households, target: householdObject.config.universalIdentifier },
  { item: funds, target: fundObject.config.universalIdentifier },
  { item: pledges, target: pledgeObject.config.universalIdentifier },
  {
    item: fundraisingCampaigns,
    target: fundraisingCampaignObject.config.universalIdentifier,
  },
  { item: socialPosts, target: socialPostObject.config.universalIdentifier },
  { item: landingPages, target: landingPageObject.config.universalIdentifier },
  {
    item: campaigns,
    target: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageCampaign.universalIdentifier,
  },
];

describe('object navigation menu items', () => {
  it.each(items)('points $item.config.name at its object', ({ item, target }) => {
    expect(item.success).toBe(true);
    expect(item.config.type).toBe('OBJECT');
    expect(item.config.targetObjectUniversalIdentifier).toBe(target);
  });

  it('gives every item its own universal identifier', () => {
    const identifiers = items.map(({ item }) => item.config.universalIdentifier);

    expect(new Set(identifiers).size).toBe(items.length);
  });
});

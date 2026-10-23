// Stable universal identifiers for the Daily Giving entry experience.
// Do not regenerate after first sync — these IDs persist across deployments.

// ─── Daily Giving page layout & navigation ───
export const DAILY_GIVING_PAGE_LAYOUT_ID = '05eaeb36-86db-4dd2-88b7-fa9ef4ce85aa';
export const DAILY_GIVING_TAB_ID = 'd94cdfc7-2a7d-4fe1-b5e5-4eef53abcb81';
export const NAV_ITEM_DAILY_GIVING_ID = 'b4abda28-c6f1-468c-9288-57b5c1b257a5';

// ─── Widgets ───
export const WIDGET_ENTRY_FORM_ID = '0a614530-4641-471a-ad44-d3a0a640b61a';
export const WIDGET_TODAY_TABLE_ID = '437f4fa7-b10b-4916-acad-72645ed1fa84';

// ─── App-owned view backing the "Today's Gifts" record table ───
export const VIEW_DONATIONS_TODAY_ID = '5ce64107-aceb-499f-aed9-5205196085ab';

// ─── App entities ───
export const ENTRY_FRONT_COMPONENT_ID = '5be8eae2-72a3-47c5-96e6-046f5d19e3f2';
export const TODAY_GIFTS_FRONT_COMPONENT_ID = '84f6c2b3-7d91-4e5a-8c42-1b3097f6de25';
export const CASH_DEPOSIT_FRONT_COMPONENT_ID = 'ae60f99b-14e8-4a8d-a6ff-b0428669fda8';
export const ONLINE_GIFT_FRONT_COMPONENT_ID = '153f534e-247d-489a-98d2-7b78058d7501';
export const RECORD_CASH_DEPOSIT_COMMAND_ID = 'e475dcbe-f854-4bf4-b837-f7d4ca937e9f';
export const RECORD_ONLINE_GIFT_COMMAND_ID = 'd72a5586-6d7f-489f-aa06-26b38e4c8aea';
export const CREATE_DAILY_DONATIONS_LF_ID = 'b2f4b037-da0e-48c0-a172-a1196e04b463';
export const GET_DAILY_CONTEXT_LF_ID = 'a84c6f32-1fad-4cbe-850b-d3de3d74157a';
export const SEARCH_DONORS_LF_ID = 'f7a9d0e4-3b21-4c58-9e64-a10d2c7b55e8';

// ─── Field added to the workspace-owned Donation object via defineField ───
export const INKIND_DESCRIPTION_FIELD_ID = '24503a57-87fd-4e7d-bbd2-903b8f341650';
export const ONLINE_TRANSACTION_ID_FIELD_ID = '11696d74-a233-4939-bef3-f7677081eaa1';

// HTTP route paths (served under the app's /s/ functions base).
export const CREATE_DAILY_DONATIONS_ROUTE = '/daily-donations';
export const GET_DAILY_CONTEXT_ROUTE = '/daily-giving-context';
export const SEARCH_DONORS_ROUTE = '/daily-giving-donor-search';

// ─── Donation field universalIdentifiers used by the Today view ───
// (name, giftDate, amount, acknowledgmentStatus already live in
// dashboard-identifiers.ts; these four were read from live metadata.)
export const DONATION_PAYMENT_METHOD_FIELD_UID = '68bb08bc-b8ac-4d24-9ca3-eb4a8496c6cf';
export const DONATION_FUND_FIELD_UID = '6f998763-85cc-4345-a2cf-da5b48e8e12a';
export const DONATION_CHECK_NUMBER_FIELD_UID = 'ba677450-eec3-4340-bf7b-baa26893bc60';
export const DONATION_CREATED_AT_FIELD_UID = '536bfbd9-e444-5130-9839-d78e45115ca6';

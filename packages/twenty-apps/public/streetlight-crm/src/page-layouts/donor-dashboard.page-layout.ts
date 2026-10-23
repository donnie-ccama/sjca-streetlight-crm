import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  DONOR_DASHBOARD_PAGE_LAYOUT_ID,
  DONOR_DASHBOARD_TAB_ID,
  VIEW_ACK_PENDING_ID,
  VIEW_LAPSED_DONORS_ID,
  VIEW_MONTHLY_GIVING_ID,
  VIEW_SNAPSHOT_CURRENT_ID,
  VIEW_TOP_DONORS_ID,
  WIDGET_ACK_EXPORT_BAR_ID,
  WIDGET_ACK_TABLE_ID,
  WIDGET_LAPSED_EXPORT_BAR_ID,
  WIDGET_LAPSED_TABLE_ID,
  WIDGET_MONTHLY_EXPORT_BAR_ID,
  WIDGET_MONTHLY_TABLE_ID,
  WIDGET_SNAPSHOT_EXPORT_BAR_ID,
  WIDGET_SNAPSHOT_TABLE_ID,
  WIDGET_TOP_EXPORT_BAR_ID,
  WIDGET_TOP_TABLE_ID,
} from 'src/constants/dashboard-identifiers';
import {
  buildStaticExportUrl,
  REPORT_KEY_ACK_PENDING,
  REPORT_KEY_LAPSED,
  REPORT_KEY_MONTHLY,
  REPORT_KEY_SNAPSHOT,
  REPORT_KEY_TOP_DONORS,
  type DashboardReportKey,
} from 'src/shared/dashboard-report-specs';

// Donor Dashboard — metrics are computed hourly by the refresh-donor-dashboard
// logic function into dashboardSnapshot / monthlyGivingPoint rows, and
// person.isLapsed90d drives the lapsed view.
//
// Each record table is paired with a slim STANDALONE_RICH_TEXT export bar
// (native widget, directly above the table) containing a BlockNote link that
// downloads that report as a CSV attachment via the export-dashboard-report
// HTTP route. Native widgets are used deliberately: front-component widgets
// failed to mount in this workspace, while rich-text widgets render in the
// real page DOM. The renderer displays ONLY body.blocknote (a stringified
// BlockNote document); markdown is ignored for display. Links stay relative so
// the browser sends the current session cookie to the protected same-origin
// route.

const LINK_LABEL = '⬇ Export this report as a CSV file';

/**
 * Builds the stringified BlockNote document the dashboard rich-text renderer
 * expects: one paragraph block whose entire content is a single link.
 * Block types must be within DASHBOARD_BLOCK_SCHEMA (paragraph is), and the
 * `link` inline content type comes from BlockNote's defaults.
 */
const exportLinkBlocknote = (reportKey: DashboardReportKey): string => {
  const url = buildStaticExportUrl(reportKey);
  return JSON.stringify([
    {
      id: `${reportKey}-export-link-block`,
      type: 'paragraph',
      props: {
        backgroundColor: 'default',
        textColor: 'default',
        textAlignment: 'left',
      },
      content: [
        {
          type: 'link',
          href: url,
          content: [
            { type: 'text', text: LINK_LABEL, styles: {} },
          ],
        },
      ],
    },
  ]);
};

export default definePageLayout({
  universalIdentifier: DONOR_DASHBOARD_PAGE_LAYOUT_ID,
  name: 'Donor Dashboard',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: DONOR_DASHBOARD_TAB_ID,
      title: 'Overview',
      position: 0,
      icon: 'IconLayoutDashboard',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: WIDGET_SNAPSHOT_EXPORT_BAR_ID,
          title: 'Export — YTD Snapshot',
          type: 'STANDALONE_RICH_TEXT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 0,
            column: 0,
            rowSpan: 1,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'STANDALONE_RICH_TEXT',
            body: {
              blocknote: exportLinkBlocknote(REPORT_KEY_SNAPSHOT),
              markdown: null,
            },
          },
        },
        {
          universalIdentifier: WIDGET_SNAPSHOT_TABLE_ID,
          title: 'YTD Snapshot (donors incl. companies · refreshed hourly)',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: '620e500f-42c5-4cc7-a150-315b8faa6222',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 1,
            column: 0,
            rowSpan: 3,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: VIEW_SNAPSHOT_CURRENT_ID,
            recordLimit: 1,
          },
        },
        {
          universalIdentifier: WIDGET_MONTHLY_EXPORT_BAR_ID,
          title: 'Export — Monthly Giving Breakdown',
          type: 'STANDALONE_RICH_TEXT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 4,
            column: 0,
            rowSpan: 1,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'STANDALONE_RICH_TEXT',
            body: {
              blocknote: exportLinkBlocknote(REPORT_KEY_MONTHLY),
              markdown: null,
            },
          },
        },
        {
          universalIdentifier: WIDGET_MONTHLY_TABLE_ID,
          title: 'Monthly Giving Breakdown (current year)',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: 'c27b429e-d014-483a-b7fb-43ba3bf74da3',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 5,
            column: 0,
            rowSpan: 4,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: VIEW_MONTHLY_GIVING_ID,
            recordLimit: 12,
          },
        },
        {
          universalIdentifier: WIDGET_LAPSED_EXPORT_BAR_ID,
          title: 'Export — Lapsed Donors',
          type: 'STANDALONE_RICH_TEXT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 9,
            column: 0,
            rowSpan: 1,
            columnSpan: 6,
          },
          configuration: {
            configurationType: 'STANDALONE_RICH_TEXT',
            body: {
              blocknote: exportLinkBlocknote(REPORT_KEY_LAPSED),
              markdown: null,
            },
          },
        },
        {
          universalIdentifier: WIDGET_TOP_EXPORT_BAR_ID,
          title: 'Export — Top Donors',
          type: 'STANDALONE_RICH_TEXT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 9,
            column: 6,
            rowSpan: 1,
            columnSpan: 6,
          },
          configuration: {
            configurationType: 'STANDALONE_RICH_TEXT',
            body: {
              blocknote: exportLinkBlocknote(REPORT_KEY_TOP_DONORS),
              markdown: null,
            },
          },
        },
        {
          universalIdentifier: WIDGET_LAPSED_TABLE_ID,
          title: 'Lapsed Donors (90+ days since last gift)',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: '20202020-e674-48e5-a542-72570eee7213',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 10,
            column: 0,
            rowSpan: 4,
            columnSpan: 6,
          },
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: VIEW_LAPSED_DONORS_ID,
            recordLimit: 25,
          },
        },
        {
          universalIdentifier: WIDGET_TOP_TABLE_ID,
          title: 'Top Donors (lifetime)',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: '20202020-e674-48e5-a542-72570eee7213',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 10,
            column: 6,
            rowSpan: 4,
            columnSpan: 6,
          },
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: VIEW_TOP_DONORS_ID,
            recordLimit: 25,
          },
        },
        {
          universalIdentifier: WIDGET_ACK_EXPORT_BAR_ID,
          title: 'Export — Acknowledgments Pending',
          type: 'STANDALONE_RICH_TEXT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 14,
            column: 0,
            rowSpan: 1,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'STANDALONE_RICH_TEXT',
            body: {
              blocknote: exportLinkBlocknote(REPORT_KEY_ACK_PENDING),
              markdown: null,
            },
          },
        },
        {
          universalIdentifier: WIDGET_ACK_TABLE_ID,
          title: 'Acknowledgments Pending (oldest first)',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: 'cc23891b-510b-421d-96eb-13b94636fff0',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 15,
            column: 0,
            rowSpan: 4,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: VIEW_ACK_PENDING_ID,
            recordLimit: 25,
          },
        },
      ],
    },
  ],
});

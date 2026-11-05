import { defineLogicFunction, HTTPMethod } from 'twenty-sdk/define';

import {
  GET_DONOR_DASHBOARD_CONTEXT_LF_ID,
  GET_DONOR_DASHBOARD_CONTEXT_ROUTE,
} from 'src/constants/dashboard-identifiers';
import { buildDonorDashboardContext } from 'src/logic-functions/donor-dashboard.server';

// GET /s/donor-dashboard-context — one round trip powering the Donor
// Dashboard component: the current snapshot, this year's monthly points,
// and the first rows of each list with their totals.
const handler = async () => {
  try {
    return await buildDonorDashboardContext();
  } catch (error) {
    return {
      __twentyHttpResponse: true as const,
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'unknown error',
      }),
    };
  }
};

export default defineLogicFunction({
  universalIdentifier: GET_DONOR_DASHBOARD_CONTEXT_LF_ID,
  name: 'get-donor-dashboard-context',
  description:
    'Loads everything the Donor Dashboard draws: the current KPI snapshot, monthly giving points, lapsed donors, top donors, and pending acknowledgments.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: GET_DONOR_DASHBOARD_CONTEXT_ROUTE,
    httpMethod: HTTPMethod.GET,
    isAuthRequired: true,
  },
});

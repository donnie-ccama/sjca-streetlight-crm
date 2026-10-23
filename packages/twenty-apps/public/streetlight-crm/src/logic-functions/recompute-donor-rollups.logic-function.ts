import { defineLogicFunction } from 'twenty-sdk/define';

import { RECOMPUTE_DONOR_ROLLUPS_LOGIC_FUNCTION_ID } from 'src/constants/donor-identifiers';
import {
  fetchAllHardCredits,
  groupRollupsByPerson,
  writePersonRollup,
} from 'src/logic-functions/donor-rollups';

// NPSP-style donor statistics rollup. Recomputes Person.lifetimeHardGiving,
// firstGiftDate, and lastGiftDate from the hard-credit DonationCredits.
//
// Run on a cron (nightly). Does not soft-delete or destroy any records — only
// updates the three rollup fields on Person. Idempotent: re-running yields the
// same result given the same underlying DonationCredit/Donation rows.
//
// Per-credit real-time updates are handled by update-donor-rollup-on-credit;
// this nightly sweep catches drift from manual edits, import backfills, and
// orphan-credit fixes that the real-time function would miss.

const UPDATE_BATCH_SIZE = 50;

const handler = async () => {
  const rows = await fetchAllHardCredits();
  const rollups = groupRollupsByPerson(rows);

  const entries = Array.from(rollups.entries());
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += UPDATE_BATCH_SIZE) {
    const batch = entries.slice(i, i + UPDATE_BATCH_SIZE);
    await Promise.all(
      batch.map(async ([personId, rollup]) => {
        try {
          await writePersonRollup(personId, rollup);
          updated += 1;
        } catch {
          // Continue past individual failures so one bad row doesn't abort
          // the whole rollup. Failures are surfaced in the return summary.
          failed += 1;
        }
      }),
    );
  }

  return {
    personsConsidered: rollups.size,
    hardCreditsProcessed: rows.length,
    personsUpdated: updated,
    personsFailed: failed,
    completedAt: new Date().toISOString(),
  };
};

export default defineLogicFunction({
  universalIdentifier: RECOMPUTE_DONOR_ROLLUPS_LOGIC_FUNCTION_ID,
  name: 'recompute-donor-rollups',
  description:
    'Recomputes NPSP-style donor statistics on Person from hard-credit DonationCredits: ' +
    'lifetimeHardGiving (sum of creditAmount where creditType=HARD), firstGiftDate (earliest ' +
    'parent Donation.giftDate), and lastGiftDate (most recent). Idempotent. Run nightly via cron ' +
    'or on demand as a workflow action after bulk imports.',
  timeoutSeconds: 120,
  handler,
  cronTriggerSettings: {
    // 2:00 AM daily — off-hours, after any ETL/import windows.
    pattern: '0 2 * * *',
  },
});

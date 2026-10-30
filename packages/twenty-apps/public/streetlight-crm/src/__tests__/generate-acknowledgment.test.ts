import { describe, expect, it } from 'vitest';

import { shouldCreateAcknowledgmentTask } from 'src/logic-functions/generate-acknowledgment.logic-function';

describe('shouldCreateAcknowledgmentTask', () => {
  it('returns true for PENDING', () => {
    expect(shouldCreateAcknowledgmentTask({ acknowledgmentStatus: 'PENDING' })).toBe(true);
  });

  it('returns true when status is missing', () => {
    expect(shouldCreateAcknowledgmentTask({})).toBe(true);
  });

  it.each(['SENT', 'DO_NOT_ACKNOWLEDGE'])('returns false for %s', (status) => {
    expect(shouldCreateAcknowledgmentTask({ acknowledgmentStatus: status })).toBe(false);
  });
});

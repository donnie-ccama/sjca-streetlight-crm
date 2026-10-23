import { t } from '@lingui/core/macro';
import { type TimelineActivity } from '@/activities/timeline-activities/types/TimelineActivity';
import { type CurrentWorkspaceMember } from '@/auth/states/currentWorkspaceMemberState';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';

export const getTimelineActivityAuthorFullName = (
  event: TimelineActivity,
  currentWorkspaceMember: CurrentWorkspaceMember,
) => {
  if (isDefined(event.workspaceMember)) {
    return currentWorkspaceMember.id === event.workspaceMember.id
      ? t`You`
      : `${event.workspaceMember?.name.firstName} ${event.workspaceMember?.name.lastName}`;
  }
  return doNotTranslate('Streetlight CRM');
};

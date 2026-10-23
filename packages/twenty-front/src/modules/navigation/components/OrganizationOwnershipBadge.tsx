import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { type SyntheticEvent } from 'react';
import {
  ensureAbsoluteUrl,
  getUrlSafely,
  isDefined,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useIsNavigationDrawerContentExpanded } from '@/ui/navigation/navigation-drawer/hooks/useIsNavigationDrawerContentExpanded';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

const DEFAULT_ORGANIZATION_LOGO = `${window.location.origin}/images/brand/icon-192.png`;

const StyledBadge = styled.section<{ isExpanded: boolean }>`
  background: var(--sl-ownership-background);
  border: 1px solid var(--sl-ownership-border);
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  color: var(--sl-ownership-ink);
  display: flex;
  flex-direction: column;
  gap: ${({ isExpanded }) => (isExpanded ? themeCssVariables.spacing[2] : '0')};
  height: ${({ isExpanded }) => (isExpanded ? 'auto' : '32px')};
  min-width: 0;
  overflow: hidden;
  padding: ${({ isExpanded }) =>
    isExpanded ? themeCssVariables.spacing[3] : themeCssVariables.spacing[1]};
  width: ${({ isExpanded }) => (isExpanded ? '100%' : '32px')};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledLogo = styled.img<{ isExpanded: boolean }>`
  display: block;
  flex-shrink: 0;
  height: ${({ isExpanded }) => (isExpanded ? '28px' : '22px')};
  object-fit: contain;
  width: ${({ isExpanded }) => (isExpanded ? '28px' : '22px')};
`;

const StyledOrganizationName = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  line-height: ${themeCssVariables.text.lineHeight.md};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledDetails = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  margin: 0;
  min-width: 0;
`;

const StyledDetail = styled.div`
  align-items: baseline;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(34px, auto) minmax(0, 1fr);
`;

const StyledDetailLabel = styled.dt`
  color: var(--sl-ownership-muted);
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledDetailValue = styled.dd`
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledWorkspaceLink = styled.a`
  color: inherit;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  &:focus-visible {
    border-radius: ${themeCssVariables.border.radius.xs};
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const handleLogoError = (event: SyntheticEvent<HTMLImageElement>) => {
  if (event.currentTarget.src !== DEFAULT_ORGANIZATION_LOGO) {
    event.currentTarget.src = DEFAULT_ORGANIZATION_LOGO;
  }
};

export const OrganizationOwnershipBadge = () => {
  const { t } = useLingui();
  const isExpanded = useIsNavigationDrawerContentExpanded();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const hasWorkspacePermission = useHasPermissionFlag(
    PermissionFlagType.WORKSPACE,
  );

  const organizationName = currentWorkspace?.displayName ?? t`Organization`;
  const workspaceUrl = ensureAbsoluteUrl(
    isDefined(currentWorkspace)
      ? getWorkspaceUrl(currentWorkspace.workspaceUrls)
      : window.location.origin,
  );
  const displayWorkspaceUrl = getUrlSafely(workspaceUrl)?.host ?? workspaceUrl;
  const administratorName =
    hasWorkspacePermission && isDefined(currentWorkspaceMember)
      ? getWorkspaceMemberNameOrEmail(currentWorkspaceMember)
      : t`Workspace administrator`;
  const workspaceLogo = currentWorkspace?.logo;
  const logoUrl = isNonEmptyString(workspaceLogo)
    ? getAbsoluteImageUrl(workspaceLogo)
    : DEFAULT_ORGANIZATION_LOGO;

  return (
    <StyledBadge isExpanded={isExpanded} aria-label={t`Organization ownership`}>
      <StyledHeader>
        <StyledLogo
          isExpanded={isExpanded}
          src={logoUrl}
          alt={t`${organizationName} logo`}
          onError={handleLogoError}
        />
        {isExpanded && (
          <StyledOrganizationName title={organizationName}>
            {organizationName}
          </StyledOrganizationName>
        )}
      </StyledHeader>

      {isExpanded && (
        <StyledDetails>
          <StyledDetail>
            <StyledDetailLabel>{t`CRM`}</StyledDetailLabel>
            <StyledDetailValue title={workspaceUrl}>
              <StyledWorkspaceLink href={workspaceUrl}>
                {displayWorkspaceUrl}
              </StyledWorkspaceLink>
            </StyledDetailValue>
          </StyledDetail>
          <StyledDetail>
            <StyledDetailLabel>{t`Admin`}</StyledDetailLabel>
            <StyledDetailValue title={administratorName}>
              {administratorName}
            </StyledDetailValue>
          </StyledDetail>
        </StyledDetails>
      )}
    </StyledBadge>
  );
};

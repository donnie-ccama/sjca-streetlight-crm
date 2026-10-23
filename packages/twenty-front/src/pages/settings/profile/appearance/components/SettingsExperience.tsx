import { styled } from '@linaria/react';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { FormatPreferencesSettings } from '@/settings/experience/components/FormatPreferencesSettings';
import { OpenRecordInPreferencePicker } from '@/settings/experience/components/OpenRecordInPreferencePicker';
import { UiScalePicker } from '@/settings/experience/components/UiScalePicker';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { WorkspaceLogoUploader } from '@/settings/workspace/components/WorkspaceLogoUploader';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/components/layout';
import { themeCssVariables } from 'twenty-ui/theme';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { SettingsAppearance } from '~/pages/settings/profile/appearance/components/SettingsAppearance';
import { LocalePicker } from '~/pages/settings/profile/appearance/components/LocalePicker';

const StyledInterfaceControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

export const SettingsExperience = () => {
  const { t } = useLingui();
  const hasWorkspacePermission = useHasPermissionFlag(
    PermissionFlagType.WORKSPACE,
  );

  return (
    <SettingsPageLayout
      title={t`Experience`}
      links={[
        {
          children: <Trans>User</Trans>,
          href: getSettingsPath(SettingsPath.ProfilePage),
        },
        { children: <Trans>Experience</Trans> },
      ]}
    >
      <SettingsPageContainer>
        <SettingsAppearance />

        {hasWorkspacePermission && (
          <Section.Root>
            <Section.Header
              title={t`Organization logo`}
              description={t`Upload the logo shown in the ownership badge at the bottom of the sidebar`}
            />
            <WorkspaceLogoUploader />
          </Section.Root>
        )}

        <Section.Root>
          <Section.Header
            title={t`Interface`}
            description={t`Select your language and adjust the size of the interface`}
          />
          <StyledInterfaceControls>
            <LocalePicker />
            <UiScalePicker />
          </StyledInterfaceControls>
        </Section.Root>

        <Section.Root>
          <Section.Header
            title={t`Navigation`}
            description={t`Choose where records open by default. Some objects may use a workspace setting`}
          />
          <OpenRecordInPreferencePicker />
        </Section.Root>

        <Section.Root>
          <Section.Header
            title={t`Formats`}
            description={t`Configure date, time, number, timezone, and calendar start day`}
          />
          <FormatPreferencesSettings />
        </Section.Root>
        {/* Unified into FormatPreferencesSettings */}
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};

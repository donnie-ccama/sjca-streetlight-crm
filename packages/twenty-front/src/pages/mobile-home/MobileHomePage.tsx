import { MobileHomeAiChatSection } from '@/ai/components/MobileHomeAiChatSection';
import { MainNavigationDrawerNavigationContent } from '@/navigation/components/MainNavigationDrawerNavigationContent';
import { StreetlightProductHeader } from '@/navigation/components/StreetlightProductHeader';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { MultiWorkspaceDropdownButton } from '@/navigation/components/MultiWorkspaceDropdown/MultiWorkspaceDropdownButton';
import { NavigationDrawerFixedContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerFixedContent';
import { NavigationDrawerScrollableContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerScrollableContent';
import { useIsMobile } from 'twenty-ui/utilities';
import { styled } from '@linaria/react';
import { Navigate } from 'react-router-dom';
import {
  ThemeProvider,
  themeCssVariables,
  useThemeColorScheme,
} from 'twenty-ui/theme';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const StyledContainer = styled.div`
  background: var(--sl-navy);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  height: 100%;
  min-height: 0;
  padding: ${themeCssVariables.spacing[2]} 0 ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledBrandHeader = styled.header`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-shrink: 0;
  min-height: ${themeCssVariables.spacing[12]};
  padding: 0 ${themeCssVariables.spacing[5]};
`;

export const MobileHomePage = () => {
  const isMobile = useIsMobile();
  const colorScheme = useThemeColorScheme();
  const { defaultHomePagePath } = useDefaultHomePagePath();
  const hasAiPermission = useHasPermissionFlag(PermissionFlagType.AI);

  // Desktop keeps the drawer, so the page has nothing to show there.
  if (!isMobile) {
    return <Navigate to={defaultHomePagePath} replace />;
  }

  return (
    <ThemeProvider
      colorScheme={colorScheme}
      applyToRoot={false}
      className="streetlight-navigation"
    >
      <StyledContainer>
        <StyledBrandHeader>
          <StreetlightProductHeader darkSurface />
        </StyledBrandHeader>
        <NavigationDrawerFixedContent>
          <MultiWorkspaceDropdownButton />
        </NavigationDrawerFixedContent>

        <NavigationDrawerScrollableContent>
          <StyledSections>
            <MainNavigationDrawerNavigationContent />
            {hasAiPermission && <MobileHomeAiChatSection />}
          </StyledSections>
        </NavigationDrawerScrollableContent>
      </StyledContainer>
    </ThemeProvider>
  );
};

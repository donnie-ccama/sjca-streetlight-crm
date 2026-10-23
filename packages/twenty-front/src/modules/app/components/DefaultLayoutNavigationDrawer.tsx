import { AppNavigationDrawer } from '@/navigation/components/AppNavigationDrawer';
import { useShowFullscreen } from '@/ui/layout/fullscreen/hooks/useShowFullscreen';
import { styled } from '@linaria/react';
import { ThemeProvider, useThemeColorScheme } from 'twenty-ui/theme';

const StyledNavigationDrawerWrapper = styled.div`
  background: var(--sl-navy);
  flex-shrink: 0;

  @media print {
    display: none;
  }
`;

export const DefaultLayoutNavigationDrawer = () => {
  const showFullscreen = useShowFullscreen();
  const colorScheme = useThemeColorScheme();

  if (showFullscreen) {
    return null;
  }

  return (
    <ThemeProvider
      colorScheme={colorScheme}
      applyToRoot={false}
      className="streetlight-navigation"
    >
      <StyledNavigationDrawerWrapper>
        <AppNavigationDrawer />
      </StyledNavigationDrawerWrapper>
    </ThemeProvider>
  );
};

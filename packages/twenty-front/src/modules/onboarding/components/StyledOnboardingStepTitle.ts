import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

export const StyledOnboardingStepTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-family: var(--sl-font-display);
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
`;

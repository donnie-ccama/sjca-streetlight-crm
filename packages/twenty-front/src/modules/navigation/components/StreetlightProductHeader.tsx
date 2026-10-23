import { styled } from '@linaria/react';
import { doNotTranslate } from 'twenty-shared/i18n';
import { themeCssVariables } from 'twenty-ui/theme';

type StreetlightProductHeaderProps = {
  compact?: boolean;
  darkSurface?: boolean;
};

const StyledBrand = styled.span`
  align-items: center;
  display: inline-flex;
  flex-shrink: 0;
  line-height: 0;
`;

const StyledHorizontalLogo = styled.img`
  display: block;
  height: auto;
  max-height: ${themeCssVariables.spacing[8]};
  min-width: 140px;
  object-fit: contain;
  object-position: left center;
  width: 160px;
`;

const StyledLightLogo = styled(StyledHorizontalLogo)`
  .dark & {
    display: none;
  }
`;

const StyledDarkLogo = styled(StyledHorizontalLogo)`
  display: none;

  .dark & {
    display: block;
  }
`;

const StyledCompactLogo = styled.img`
  border-radius: ${themeCssVariables.border.radius.sm};
  display: block;
  height: ${themeCssVariables.spacing[7]};
  width: ${themeCssVariables.spacing[7]};
`;

export const StreetlightProductHeader = ({
  compact = false,
  darkSurface = false,
}: StreetlightProductHeaderProps) => (
  <StyledBrand role="img" aria-label={doNotTranslate('Streetlight CRM')}>
    {compact ? (
      <StyledCompactLogo
        src="/images/brand/streetlight-crm-app-icon.svg"
        alt=""
      />
    ) : darkSurface ? (
      <StyledHorizontalLogo
        src="/images/brand/streetlight-crm-logo-white.svg"
        alt=""
      />
    ) : (
      <>
        <StyledLightLogo src="/images/brand/streetlight-crm-logo.svg" alt="" />
        <StyledDarkLogo
          src="/images/brand/streetlight-crm-logo-white.svg"
          alt=""
        />
      </>
    )}
  </StyledBrand>
);

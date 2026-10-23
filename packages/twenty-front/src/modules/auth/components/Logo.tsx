import { UndecoratedLink } from '@/ui/navigation/link/components/UndecoratedLink/UndecoratedLink';
import { getWorkspaceAvatarColorSeed } from '@/workspace/utils/getWorkspaceAvatarColorSeed';
import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { AppPath } from 'twenty-shared/types';
import { doNotTranslate } from 'twenty-shared/i18n';
import { getImageAbsoluteURI, isDefined } from 'twenty-shared/utils';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { themeCssVariables } from 'twenty-ui/theme';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { useRedirectToDefaultDomain } from '@/domain-manager/hooks/useRedirectToDefaultDomain';

type LogoProps = {
  primaryLogo?: string | null;
  secondaryLogo?: string | null;
  placeholder?: string | null;
  onClick?: () => void;
  to?: AppPath;
};

const StyledContainer = styled.div<{ isUsingDefaultLogo: boolean }>`
  height: ${({ isUsingDefaultLogo }) =>
    isUsingDefaultLogo ? '49px' : themeCssVariables.spacing[12]};
  margin-bottom: ${themeCssVariables.spacing[4]};
  margin-top: ${themeCssVariables.spacing[4]};

  position: relative;
  width: ${({ isUsingDefaultLogo }) =>
    isUsingDefaultLogo ? '250px' : themeCssVariables.spacing[12]};
`;

const StyledSecondaryLogo = styled.img`
  border-radius: ${themeCssVariables.border.radius.xs};
  height: ${themeCssVariables.spacing[6]};
  width: ${themeCssVariables.spacing[6]};
`;

const StyledSecondaryLogoContainer = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.sm};
  bottom: calc(-1 * ${themeCssVariables.spacing[3]});
  display: flex;
  height: ${themeCssVariables.spacing[7]};
  justify-content: center;

  position: absolute;
  right: calc(-1 * ${themeCssVariables.spacing[3]});
  width: ${themeCssVariables.spacing[7]};
`;

const StyledPrimaryLogo = styled.div`
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  height: 100%;
  width: 100%;
`;

const StyledDefaultLogo = styled.img`
  display: block;
  height: auto;
  width: 250px;
`;

const StyledDefaultLightLogo = styled(StyledDefaultLogo)`
  .dark & {
    display: none;
  }
`;

const StyledDefaultDarkLogo = styled(StyledDefaultLogo)`
  display: none;

  .dark & {
    display: block;
  }
`;

export const Logo = ({
  primaryLogo,
  secondaryLogo,
  placeholder,
  onClick,
  to = AppPath.SignInUp,
}: LogoProps) => {
  const { redirectToDefaultDomain } = useRedirectToDefaultDomain();
  const isUsingDefaultLogo = !isDefined(primaryLogo);

  const primaryLogoUrl = getImageAbsoluteURI({
    imageUrl: primaryLogo ?? '',
    baseUrl: REACT_APP_SERVER_BASE_URL,
  });

  const secondaryLogoUrl = isNonEmptyString(secondaryLogo)
    ? getImageAbsoluteURI({
        imageUrl: secondaryLogo,
        baseUrl: REACT_APP_SERVER_BASE_URL,
      })
    : null;

  return (
    <StyledContainer
      isUsingDefaultLogo={isUsingDefaultLogo}
      onClick={() => onClick?.()}
    >
      {isUsingDefaultLogo ? (
        <UndecoratedLink
          to={to}
          onClick={() => redirectToDefaultDomain()}
          aria-label={doNotTranslate('Streetlight CRM home')}
        >
          <StyledDefaultLightLogo
            src="/images/brand/streetlight-crm-logo.svg"
            alt=""
          />
          <StyledDefaultDarkLogo
            src="/images/brand/streetlight-crm-logo-white.svg"
            alt=""
          />
        </UndecoratedLink>
      ) : (
        <StyledPrimaryLogo
          style={{ backgroundImage: `url(${primaryLogoUrl})` }}
        />
      )}
      {isDefined(secondaryLogoUrl) ? (
        <StyledSecondaryLogoContainer>
          <StyledSecondaryLogo src={secondaryLogoUrl} />
        </StyledSecondaryLogoContainer>
      ) : (
        isDefined(placeholder) && (
          <StyledSecondaryLogoContainer>
            <Avatar
              size="lg"
              name={placeholder}
              shape="square"
              colorSeed={getWorkspaceAvatarColorSeed(placeholder)}
            />
          </StyledSecondaryLogoContainer>
        )
      )}
    </StyledContainer>
  );
};

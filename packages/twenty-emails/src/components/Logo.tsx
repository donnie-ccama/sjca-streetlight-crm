import { type I18n } from '@lingui/core';
import { Img } from 'react-email';

const logoStyle = {
  marginBottom: '40px',
};

type LogoProps = {
  i18n: I18n;
};

export const Logo = ({ i18n }: LogoProps) => {
  return (
    <Img
      src="https://streetlight.digital/brand/crm/streetlight-crm-logo-email.png"
      alt={i18n._('Streetlight CRM logo')}
      width="180"
      height="35"
      style={logoStyle}
    />
  );
};

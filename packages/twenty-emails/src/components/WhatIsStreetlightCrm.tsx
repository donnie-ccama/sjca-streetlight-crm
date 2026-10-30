import { type I18n } from '@lingui/core';
import { MainText } from 'src/components/MainText';
import { SubTitle } from 'src/components/SubTitle';

type WhatIsStreetlightCrmProps = {
  i18n: I18n;
};

export const WhatIsStreetlightCrm = ({ i18n }: WhatIsStreetlightCrmProps) => {
  return (
    <>
      <SubTitle value={i18n._('What is Streetlight CRM?')} />
      <MainText>
        {i18n._(
          "It's a donor CRM that helps your team keep track of the people, gifts and relationships behind your mission.",
        )}
      </MainText>
    </>
  );
};

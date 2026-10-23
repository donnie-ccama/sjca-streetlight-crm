import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getImageAbsoluteURI } from 'twenty-shared/utils';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const PageFavicon = () => {
  const workspacePublicData = useAtomStateValue(workspacePublicDataState);
  const workspaceLogoUrl = workspacePublicData?.logo
    ? getImageAbsoluteURI({
        imageUrl: workspacePublicData.logo,
        baseUrl: REACT_APP_SERVER_BASE_URL,
      })
    : null;
  const faviconUrl =
    workspaceLogoUrl ?? `${window.location.origin}/images/brand/favicon.svg`;

  return (
    <Helmet>
      <link
        rel="icon"
        type={workspaceLogoUrl === null ? 'image/svg+xml' : undefined}
        href={faviconUrl}
      />
    </Helmet>
  );
};

import { useCallback, useEffect, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  getApplicationVariable,
  useRecordId,
} from 'twenty-sdk/front-component';

import { SOCIAL_POST_PREVIEW_FRONT_COMPONENT_ID } from 'src/constants/marketing-identifiers';
import { toAbsoluteUrl } from 'src/front-components/landing-page-builder/preview-content';
import {
  CARD_GAP,
  DANGER,
  STYLE,
  WARNING,
} from 'src/shared/daily-giving-styles';
import type { SocialPostRecord } from 'src/shared/marketing/publish';
import {
  buildSocialPreview,
  mediaKindFor,
  type MediaKind,
  type NetworkPreview,
  type PreviewNetwork,
} from 'src/shared/marketing/social-preview';

const api = new RestApiClient();

type SocialPostRest = SocialPostRecord & {
  media?: { url?: string; label?: string; extension?: string }[] | null;
  landingPage?: { slug?: string | null } | null;
};

type Media = { url: string; kind: MediaKind; alt: string };

type Width = 'phone' | 'desktop';

const WIDTHS: Record<Width, number> = { phone: 375, desktop: 560 };

const readVariable = (name: string): string =>
  (getApplicationVariable(name) ?? '').trim();

const readApiBaseUrl = (): string =>
  (globalThis.process?.env?.TWENTY_API_URL ?? '').trim();

const fetchPost = async (postId: string): Promise<SocialPostRest | null> => {
  const response = await api.get<{ data?: { socialPost?: SocialPostRest } }>(
    `/rest/socialPosts/${encodeURIComponent(postId)}`,
    { query: { depth: 1 } },
  );

  return response.data?.socialPost ?? null;
};

const firstMedia = (post: SocialPostRest): Media | null => {
  const file = post.media?.[0];
  const url = file?.url ? toAbsoluteUrl(file.url, readApiBaseUrl()) : null;

  if (!file || url === null) return null;

  return {
    url,
    kind: mediaKindFor(file.extension ?? null),
    alt: file.label ?? '',
  };
};

const Toggle = <TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
}) => (
  <div
    role="group"
    aria-label={label}
    style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
        style={
          option.value === value ? STYLE.secondaryButton : STYLE.ghostButton
        }
      >
        {option.label}
      </button>
    ))}
  </div>
);

// Feed networks show a photo at its own shape, so only the video networks get a fixed frame.
const MediaView = ({
  media,
  aspectRatio = 'auto',
}: {
  media: Media | null;
  aspectRatio?: string;
}) =>
  media === null ? null : media.kind === 'video' ? (
    <video
      src={media.url}
      controls
      muted
      style={{
        width: '100%',
        aspectRatio,
        objectFit: 'contain',
        display: 'block',
        background: '#000',
      }}
    />
  ) : (
    <img
      src={media.url}
      alt={media.alt}
      style={{
        width: '100%',
        aspectRatio,
        objectFit: 'contain',
        display: 'block',
        background: '#000',
      }}
    />
  );

const Caption = ({ preview }: { preview: NetworkPreview }) => (
  <div
    style={{
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      fontSize: 14,
      lineHeight: 1.45,
    }}
  >
    {preview.text}
  </div>
);

const AccountHeader = ({
  name,
  logoUrl,
  note,
  color = 'inherit',
}: {
  name: string;
  logoUrl: string;
  note: string;
  color?: string;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color }}>
    {logoUrl !== '' ? (
      <img
        src={logoUrl}
        alt=""
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          objectFit: 'cover',
        }}
      />
    ) : (
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#1b2b4b',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    )}
    <div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{note}</div>
    </div>
  </div>
);

const Mockup = ({
  preview,
  media,
  postName,
  accountName,
  logoUrl,
}: {
  preview: NetworkPreview;
  media: Media | null;
  postName: string;
  accountName: string;
  logoUrl: string;
}) => {
  const frame = {
    border: '1px solid var(--sl-hairline-strong)',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#fff',
    color: '#1d1d1f',
  };

  switch (preview.network) {
    case 'FACEBOOK':
      return (
        <div style={frame}>
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            <AccountHeader
              name={accountName}
              logoUrl={logoUrl}
              note="Just now"
            />
            <Caption preview={preview} />
          </div>
          <MediaView media={media} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              padding: 10,
              fontSize: 13,
              opacity: 0.7,
              borderTop: '1px solid #ececec',
            }}
          >
            <span>Like</span>
            <span>Comment</span>
            <span>Share</span>
          </div>
        </div>
      );
    case 'INSTAGRAM':
      return (
        <div style={frame}>
          <div style={{ padding: 12 }}>
            <AccountHeader
              name={accountName}
              logoUrl={logoUrl}
              note="Amarillo"
            />
          </div>
          <MediaView media={media} />
          <div style={{ padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Like · Comment · Share
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{accountName}</div>
            <Caption preview={preview} />
          </div>
        </div>
      );
    case 'TIKTOK':
      return (
        <div
          style={{
            ...frame,
            background: '#000',
            color: '#fff',
            position: 'relative',
            aspectRatio: '9 / 16',
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <MediaView media={media} aspectRatio="9 / 16" />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: 14,
              display: 'grid',
              gap: 8,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))',
            }}
          >
            <div style={{ fontWeight: 700 }}>@{accountName}</div>
            <Caption preview={preview} />
          </div>
        </div>
      );
    default:
      return (
        <div style={frame}>
          <MediaView media={media} aspectRatio="16 / 9" />
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {postName.slice(0, 100)}
            </div>
            <AccountHeader name={accountName} logoUrl={logoUrl} note="Public" />
            <div
              style={{ background: '#f5f5f7', borderRadius: 8, padding: 10 }}
            >
              <Caption preview={preview} />
            </div>
          </div>
        </div>
      );
  }
};

const SocialPostPreview = () => {
  const recordId = useRecordId();
  const [post, setPost] = useState<SocialPostRest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PreviewNetwork>('FACEBOOK');
  const [width, setWidth] = useState<Width>('phone');
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (recordId === null) return;

    const request = ++requestRef.current;

    setLoading(true);
    setError(null);

    try {
      const loaded = await fetchPost(recordId);

      if (request !== requestRef.current) return;
      setPost(loaded);
      if (loaded === null) setError('This social post was not found.');
    } catch {
      if (request === requestRef.current) {
        setError('The post did not load. Check your connection and try again.');
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (recordId === null) {
    return <div style={STYLE.root}>Open one social post to preview it.</div>;
  }

  if (post === null) {
    return (
      <div style={STYLE.root}>
        {loading ? 'Loading…' : (error ?? 'This social post was not found.')}
      </div>
    );
  }

  const media = firstMedia(post);
  const preview = buildSocialPreview({
    post,
    landingPageSlug: post.landingPage?.slug || null,
    baseUrl: readVariable('LANDING_PAGE_BASE_URL'),
    mediaKind: media?.kind ?? 'none',
  });
  const current =
    preview.networks.find((entry) => entry.network === selected) ??
    preview.networks[0];
  const accountName =
    readVariable('LANDING_PAGE_ORGANIZATION_NAME') || 'Your organization';

  return (
    <div style={{ ...STYLE.root, display: 'grid', gap: CARD_GAP }}>
      <div style={{ ...STYLE.card, marginBottom: 0, display: 'grid', gap: 12 }}>
        <div style={{ ...STYLE.cardHead, marginBottom: 0 }}>
          <div>
            <h1 style={STYLE.cardTitle}>Preview</h1>
            <div style={STYLE.hint}>
              The preview shows the saved post. After you change a caption or
              the photo, select Refresh.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{ ...STYLE.ghostButton, opacity: loading ? 0.55 : 1 }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error !== null && (
          <div
            role="alert"
            style={{ ...STYLE.alert, marginBottom: 0, color: DANGER }}
          >
            {error}
          </div>
        )}

        {preview.problems.length > 0 && (
          <div
            role="alert"
            style={{
              ...STYLE.alert,
              marginBottom: 0,
              display: 'grid',
              gap: 4,
              color: DANGER,
            }}
          >
            <div>Approve and Publish will fail until you fix these:</div>
            {preview.problems.map((problem) => (
              <div key={problem}>{problem}</div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'space-between',
          }}
        >
          <Toggle
            label="Network"
            value={current.network}
            options={preview.networks.map((entry) => ({
              value: entry.network,
              label: entry.sends ? entry.label : `${entry.label} (skipped)`,
            }))}
            onChange={setSelected}
          />
          <Toggle
            label="Preview width"
            value={width}
            options={[
              { value: 'phone', label: 'Phone' },
              { value: 'desktop', label: 'Desktop' },
            ]}
            onChange={setWidth}
          />
        </div>

        {current.warnings.length > 0 && (
          <div
            role="status"
            style={{
              ...STYLE.alert,
              marginBottom: 0,
              display: 'grid',
              gap: 4,
              color: current.sends ? WARNING : DANGER,
            }}
          >
            {current.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        )}

        {current.text !== null && (
          <div style={STYLE.hint}>
            {current.characterCount.toLocaleString('en-US')} characters
          </div>
        )}
      </div>

      {current.text !== null && (
        <div style={{ width: WIDTHS[width], maxWidth: '100%' }}>
          <Mockup
            preview={current}
            media={media}
            postName={post.name ?? post.slug ?? ''}
            accountName={accountName}
            logoUrl={readVariable('LANDING_PAGE_LOGO_URL')}
          />
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: SOCIAL_POST_PREVIEW_FRONT_COMPONENT_ID,
  name: 'social-post-preview',
  description:
    'Shows a Social Post the way each network will show it, with the link the app adds and warnings before approval.',
  component: SocialPostPreview,
});

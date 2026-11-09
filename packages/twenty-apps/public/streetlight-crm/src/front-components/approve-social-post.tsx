import { useEffect, useState } from 'react';
import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  getApplicationVariable,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import { APPROVE_SOCIAL_POST_FRONT_COMPONENT_ID } from 'src/constants/marketing-identifiers';
import { DANGER, STYLE, SUCCESS } from 'src/shared/daily-giving-styles';
import { buildPostLink } from 'src/shared/marketing/attribution';
import {
  APPROVABLE_STATUSES,
  buildPublishRoutePath,
  captionedNetworks,
  type SocialPostRecord,
} from 'src/shared/marketing/publish';

// Default runAs is the signed-in person; the publish route records them as approver.
const api = new RestApiClient();

type LoadedPost = SocialPostRecord & {
  mediaUrls: string[];
  landingPageSlug: string | null;
};

type Notice = { tone: 'error' | 'success'; text: string };

type PublishReply = { ok: boolean; published?: boolean; error?: string };

type SocialPostRestRecord = Partial<
  Record<Exclude<keyof SocialPostRecord, 'id'>, string | null>
> & {
  id: string;
  media?: { url?: string | null }[] | null;
  landingPage?: { slug?: string | null } | null;
};

const toLoadedPost = (record: SocialPostRestRecord): LoadedPost => ({
  id: record.id,
  name: record.name ?? null,
  slug: record.slug ?? null,
  status: record.status ?? '',
  approvedById: record.approvedById ?? null,
  approvedAt: record.approvedAt ?? null,
  scheduledAt: record.scheduledAt ?? null,
  captionFacebook: record.captionFacebook ?? null,
  captionInstagram: record.captionInstagram ?? null,
  captionTiktok: record.captionTiktok ?? null,
  captionYoutube: record.captionYoutube ?? null,
  mediaUrls: (record.media ?? [])
    .map((file) => file.url)
    .filter((url): url is string => typeof url === 'string' && url !== ''),
  landingPageSlug: record.landingPage?.slug || null,
});

const errorText = (error: unknown, fallback: string): string => {
  if (error instanceof RestApiClientError) {
    const body = error.body as { error?: unknown; messages?: unknown } | null;

    if (typeof body?.error === 'string') return body.error;

    if (Array.isArray(body?.messages) && typeof body.messages[0] === 'string') {
      return body.messages[0];
    }
  }

  return fallback;
};

const ApproveSocialPost = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const postId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;
  const baseUrl = getApplicationVariable('LANDING_PAGE_BASE_URL') ?? '';
  const [post, setPost] = useState<LoadedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>();

  useEffect(() => {
    if (postId === null) {
      setLoading(false);

      return;
    }

    let cancelled = false;

    api
      .get<{ data?: { socialPost?: SocialPostRestRecord } }>(
        `/rest/socialPosts/${encodeURIComponent(postId)}`,
        { query: { depth: 1 } },
      )
      .then((response) => {
        if (cancelled) return;

        const record = response.data?.socialPost;

        setPost(record ? toLoadedPost(record) : null);
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice({ tone: 'error', text: errorText(error, 'The post could not be loaded.') });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const approve = async () => {
    if (post === null) return;

    setWorking(true);
    setNotice(undefined);

    try {
      const reply = await api.post<PublishReply>(`/s${buildPublishRoutePath(post.id)}`, {
        approve: true,
      });

      setPost({ ...post, status: reply.published ? 'PUBLISHED' : 'APPROVED' });
      setNotice({
        tone: 'success',
        text: reply.published
          ? 'Approved and sent to the posting service.'
          : 'Approved. No posting service key is set, so post it by hand.',
      });
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error, 'The post was not published.') });
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <div style={STYLE.root}>Loading…</div>;
  }

  if (postId === null || post === null) {
    return (
      <div style={STYLE.root}>
        {notice?.text ?? 'Open one Social Post to approve it.'}
      </div>
    );
  }

  const networks = captionedNetworks(post);
  const canApprove = APPROVABLE_STATUSES.includes(post.status) && !working;

  return (
    <div style={{ ...STYLE.root, display: 'grid', gap: 16 }}>
      <div style={STYLE.card}>
        <h2 style={STYLE.cardTitle}>{post.name || post.slug || 'Social Post'}</h2>
        <div style={STYLE.hint}>
          Status: {post.status}
          {post.scheduledAt ? ` · Scheduled ${new Date(post.scheduledAt).toLocaleString()}` : ''}
        </div>
      </div>

      <div style={STYLE.card}>
        <div style={STYLE.fieldLabel}>Media</div>
        {post.mediaUrls.length === 0 ? (
          <div style={STYLE.hint}>No media</div>
        ) : (
          post.mediaUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img
                src={url}
                alt="Post media"
                style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8 }}
              />
            </a>
          ))
        )}
      </div>

      {networks.length === 0 ? (
        <div style={STYLE.card}>No captions. Nothing would be posted.</div>
      ) : (
        networks.map((entry) => {
          const link =
            baseUrl !== '' && post.landingPageSlug !== null && post.slug
              ? buildPostLink({
                  baseUrl,
                  landingPageSlug: post.landingPageSlug,
                  socialPostSlug: post.slug,
                  network: entry.network,
                })
              : null;

          return (
            <div key={entry.platform} style={STYLE.card}>
              <div style={STYLE.fieldLabel}>{entry.label}</div>
              <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>
                {post[entry.captionField]}
              </div>
              {link === null ? (
                <div style={{ color: DANGER }}>
                  No landing page link: set a landing page, a slug, and LANDING_PAGE_BASE_URL.
                </div>
              ) : (
                <a href={link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                  {link}
                </a>
              )}
            </div>
          );
        })
      )}

      {notice && (
        <div style={{ color: notice.tone === 'error' ? DANGER : SUCCESS }}>{notice.text}</div>
      )}

      <button
        type="button"
        onClick={approve}
        disabled={!canApprove}
        style={{ ...STYLE.primaryButton, opacity: canApprove ? 1 : 0.5 }}
      >
        {working ? 'Approving…' : 'Approve and publish'}
      </button>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: APPROVE_SOCIAL_POST_FRONT_COMPONENT_ID,
  name: 'approve-social-post',
  description:
    'Shows a Social Post with its captions, media, and links, and lets a person approve and publish it.',
  component: ApproveSocialPost,
});

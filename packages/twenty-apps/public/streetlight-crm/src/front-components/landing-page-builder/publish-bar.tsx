import {
  CARD_GAP,
  DANGER,
  STYLE,
  SUCCESS,
  WARNING,
} from 'src/shared/daily-giving-styles';

type PublishBarProps = {
  hasUnpublishedChanges: boolean;
  publishedByName: string | null;
  publishedAt: string | null;
  isLive: boolean;
  publicUrl: string | null;
  publicUrlProblem: string | null;
  isConfirming: boolean;
  isPublishing: boolean;
  isUploading: boolean;
  canPublish: boolean;
  blockedReason: string | null;
  onPublish: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onCopyLink: () => void;
  invalidSlug: string | null;
  slugSuggestion: string;
  isFixingSlug: boolean;
  onFixSlug: (suggestion: string) => void;
};

const formatPublishedAt = (publishedAt: string): string => {
  const date = new Date(publishedAt);

  return Number.isNaN(date.getTime())
    ? publishedAt
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
};

export const PublishBar = ({
  hasUnpublishedChanges,
  publishedByName,
  publishedAt,
  isLive,
  publicUrl,
  publicUrlProblem,
  isConfirming,
  isPublishing,
  isUploading,
  canPublish,
  blockedReason,
  onPublish,
  onConfirm,
  onCancel,
  onCopyLink,
  invalidSlug,
  slugSuggestion,
  isFixingSlug,
  onFixSlug,
}: PublishBarProps) => (
  <div style={{ ...STYLE.card, display: 'grid', gap: CARD_GAP / 2 }}>
    <div style={{ ...STYLE.cardHead, marginBottom: 0 }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <span
          role="status"
          style={{
            fontWeight: 600,
            color: hasUnpublishedChanges ? WARNING : SUCCESS,
          }}
        >
          {hasUnpublishedChanges
            ? 'Unpublished changes'
            : 'The public page matches the draft'}
        </span>
        <span style={STYLE.hint}>
          {publishedAt === null
            ? 'Never published'
            : `Last published by ${publishedByName ?? 'someone'} on ${formatPublishedAt(publishedAt)}`}
        </span>
      </div>

      {isConfirming ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            Publish these changes to the public page?
          </span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPublishing || isUploading}
            style={{
              ...STYLE.primaryButton,
              opacity: isPublishing || isUploading ? 0.55 : 1,
            }}
          >
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPublishing}
            style={STYLE.ghostButton}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {!canPublish && blockedReason !== null && (
            <span style={STYLE.hint}>{blockedReason}</span>
          )}
          <button
            type="button"
            onClick={onPublish}
            disabled={!canPublish}
            style={{ ...STYLE.primaryButton, opacity: canPublish ? 1 : 0.55 }}
          >
            Publish
          </button>
        </div>
      )}
    </div>

    {!isLive && (
      <div style={{ ...STYLE.alert, marginBottom: 0 }}>
        This page is not live yet. Set its status to Live to make it public.
      </div>
    )}

    {invalidSlug !== null && (
      <div
        role="alert"
        style={{
          ...STYLE.alert,
          marginBottom: 0,
          display: 'grid',
          gap: 8,
          color: DANGER,
        }}
      >
        <div>
          The slug "{invalidSlug}" breaks the public link. Use only lowercase
          letters, numbers, and dashes.
        </div>
        {slugSuggestion === '' ? (
          <div>Type a new slug on the page record, for example learn-more.</div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => onFixSlug(slugSuggestion)}
              disabled={isFixingSlug}
              style={{
                ...STYLE.primaryButton,
                opacity: isFixingSlug ? 0.55 : 1,
              }}
            >
              {isFixingSlug ? 'Fixing…' : 'Fix slug'}
            </button>
            <span>Changes it to {slugSuggestion}</span>
          </div>
        )}
      </div>
    )}

    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span style={STYLE.fieldLabel}>Public link</span>
      {publicUrl === null ? (
        <span style={STYLE.hint}>{publicUrlProblem}</span>
      ) : (
        <>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            style={{ wordBreak: 'break-all' }}
          >
            {publicUrl}
          </a>
          <button type="button" onClick={onCopyLink} style={STYLE.ghostButton}>
            Copy
          </button>
        </>
      )}
    </div>
  </div>
);

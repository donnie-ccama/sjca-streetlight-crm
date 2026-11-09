import { useState } from 'react';
import { uploadFile } from 'twenty-sdk/front-component';

import type { PhotoDraft } from 'src/front-components/landing-page-builder/use-builder-state';
import { DANGER, STYLE } from 'src/shared/daily-giving-styles';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type PhotoFieldProps = {
  photo: PhotoDraft | null;
  // Workspace field metadata id of landingPageSection.photo, or null while it loads.
  fieldMetadataId: string | null;
  onChange: (photo: PhotoDraft | null) => void;
  onUploadingChange: (isUploading: boolean) => void;
};

export const PhotoField = ({
  photo,
  fieldMetadataId,
  onChange,
  onUploadingChange,
}: PhotoFieldProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('That file is not a photo. Choose a JPG, PNG, or WebP image.');

      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That photo is larger than 10 MB. Choose a smaller one.');

      return;
    }
    if (fieldMetadataId === null) {
      setError('Photo upload is not ready yet. Wait a moment and try again.');

      return;
    }

    setIsUploading(true);
    onUploadingChange(true);

    try {
      const result = await uploadFile(file, { fieldMetadataId, fileName: file.name });

      if (result.status === 'failed') {
        setError('The photo did not upload. Check your connection and try again.');

        return;
      }
      onChange({
        fileId: result.file.fileId,
        label: photo?.label ?? '',
        url: result.file.url,
      });
    } catch {
      setError('The photo did not upload. Check your connection and try again.');
    } finally {
      setIsUploading(false);
      onUploadingChange(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={STYLE.fieldLabel}>Photo</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {photo?.url ? (
          <img
            src={photo.url}
            alt={photo.label}
            style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8 }}
          />
        ) : (
          <div
            style={{
              width: 120,
              height: 90,
              borderRadius: 8,
              border: '1px dashed var(--sl-hairline-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--sl-text-secondary)',
              fontSize: 12,
            }}
          >
            {photo ? 'Photo set' : 'No photo'}
          </div>
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>
              {isUploading ? 'Uploading…' : photo ? 'Replace photo' : 'Upload photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];

                event.currentTarget.value = '';
                if (file) void upload(file);
              }}
            />
          </label>
          {photo && (
            <button
              type="button"
              style={STYLE.ghostButton}
              onClick={() => onChange(null)}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      <div style={STYLE.hint}>JPG, PNG, or WebP, up to 10 MB.</div>
      {error && (
        <div role="alert" style={{ color: DANGER }}>
          {error}
        </div>
      )}
      {photo && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={STYLE.hint}>Describe the photo for people who cannot see it</span>
          <input
            type="text"
            value={photo.label}
            onChange={(event) => onChange({ ...photo, label: event.currentTarget.value })}
            style={STYLE.input}
          />
        </label>
      )}
    </div>
  );
};

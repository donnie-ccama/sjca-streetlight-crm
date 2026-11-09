import { STYLE } from 'src/shared/daily-giving-styles';

export type PreviewSource = 'draft' | 'published';
export type PreviewWidth = 'phone' | 'desktop';

type PreviewPaneProps = {
  html: string | null;
  source: PreviewSource;
  width: PreviewWidth;
  emptyMessage: string | null;
  onSourceChange: (source: PreviewSource) => void;
  onWidthChange: (width: PreviewWidth) => void;
};

const PHONE_WIDTH = 375;
const DESKTOP_WIDTH = 1280;
const FRAME_HEIGHT = 720;

type ToggleOption<TValue extends string> = { value: TValue; label: string };

const Toggle = <TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: ToggleOption<TValue>[];
  onChange: (value: TValue) => void;
}) => (
  <div role="group" aria-label={label} style={{ display: 'flex', gap: 4 }}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
        style={option.value === value ? STYLE.secondaryButton : STYLE.ghostButton}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const PreviewPane = ({
  html,
  source,
  width,
  emptyMessage,
  onSourceChange,
  onWidthChange,
}: PreviewPaneProps) => {
  const frameWidth = width === 'phone' ? PHONE_WIDTH : DESKTOP_WIDTH;
  // Desktop renders at full width, then shrinks to the phone-sized box.
  const scale = PHONE_WIDTH / frameWidth;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        <Toggle
          label="Preview copy"
          value={source}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
          ]}
          onChange={onSourceChange}
        />
        <Toggle
          label="Preview width"
          value={width}
          options={[
            { value: 'phone', label: 'Phone' },
            { value: 'desktop', label: 'Desktop' },
          ]}
          onChange={onWidthChange}
        />
      </div>

      <div
        style={{
          width: PHONE_WIDTH,
          maxWidth: '100%',
          height: FRAME_HEIGHT,
          overflow: 'hidden',
          borderRadius: 'var(--sl-radius-sm)',
          border: '1px solid var(--sl-hairline-strong)',
          background: '#0c0a09',
        }}
      >
        {emptyMessage !== null ? (
          <div style={{ ...STYLE.note, padding: 16, color: '#d8d2d0' }}>{emptyMessage}</div>
        ) : html === null ? (
          <div style={{ ...STYLE.note, padding: 16, color: '#d8d2d0' }}>Building the preview…</div>
        ) : (
          <iframe
            title={source === 'draft' ? 'Draft preview' : 'Published preview'}
            srcDoc={html}
            sandbox="allow-scripts"
            style={{
              width: frameWidth,
              height: FRAME_HEIGHT / scale,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              display: 'block',
            }}
          />
        )}
      </div>
    </div>
  );
};

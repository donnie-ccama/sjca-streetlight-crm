import { CARD_GAP, DANGER, STYLE } from 'src/shared/daily-giving-styles';
import type { PageType } from 'src/shared/marketing/types';

type PageTypePickerProps = {
  isWorking: boolean;
  error: string | null;
  onChoose: (pageType: PageType) => void;
};

const PAGE_TYPE_OPTIONS: { pageType: PageType; title: string; description: string }[] = [
  {
    pageType: 'ONE_STEP',
    title: 'One-Step',
    description: 'Main ask is Give. Best when people know you.',
  },
  {
    pageType: 'TWO_STEP',
    title: 'Two-Step',
    description: 'Main ask is a free signup. Then the thank-you screen asks for a gift.',
  },
];

export const PageTypePicker = ({ isWorking, error, onChoose }: PageTypePickerProps) => (
  <div style={{ ...STYLE.card, display: 'grid', gap: CARD_GAP }}>
    <div>
      <h2 style={STYLE.cardTitle}>Choose a page type</h2>
      <div style={STYLE.hint}>We add starter sections for the type you choose.</div>
    </div>

    <div style={{ display: 'flex', gap: CARD_GAP, flexWrap: 'wrap' }}>
      {PAGE_TYPE_OPTIONS.map((option) => (
        <button
          key={option.pageType}
          type="button"
          disabled={isWorking}
          onClick={() => onChoose(option.pageType)}
          style={{
            ...STYLE.card,
            flex: '1 1 240px',
            display: 'grid',
            gap: 6,
            textAlign: 'left',
            font: 'inherit',
            cursor: isWorking ? 'default' : 'pointer',
            opacity: isWorking ? 0.55 : 1,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 16 }}>{option.title}</span>
          <span style={STYLE.hint}>{option.description}</span>
        </button>
      ))}
    </div>

    {isWorking && <div role="status">Adding the starter sections…</div>}

    {error !== null && (
      <div role="alert" style={{ ...STYLE.alert, marginBottom: 0, color: DANGER }}>
        {error}
      </div>
    )}
  </div>
);

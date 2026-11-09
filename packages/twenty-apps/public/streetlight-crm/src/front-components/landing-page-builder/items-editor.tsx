import type { CSSProperties } from 'react';

import {
  ITEM_FIELD_LABELS,
  ITEM_FIELDS_BY_TYPE,
  ITEM_LABELS,
} from 'src/front-components/landing-page-builder/section-config';
import {
  EMPTY_ITEM,
  type ItemDraft,
} from 'src/front-components/landing-page-builder/use-builder-state';
import { DANGER, STYLE } from 'src/shared/daily-giving-styles';
import { MAX_ITEMS_BY_TYPE } from 'src/shared/marketing/sections';
import type { SectionType } from 'src/shared/marketing/types';

type ItemsEditorProps = {
  sectionType: SectionType;
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
};

const smallButton: CSSProperties = {
  ...STYLE.ghostButton,
  minHeight: 28,
  padding: '0 10px',
  fontSize: 12,
};

const moveItem = (items: ItemDraft[], from: number, to: number): ItemDraft[] => {
  const next = [...items];
  const [moved] = next.splice(from, 1);

  next.splice(to, 0, moved);

  return next;
};

export const ItemsEditor = ({ sectionType, items, onChange }: ItemsEditorProps) => {
  const fields = ITEM_FIELDS_BY_TYPE[sectionType];
  const maxItems = MAX_ITEMS_BY_TYPE[sectionType];
  const names = ITEM_LABELS[sectionType];
  const isFull = items.length >= maxItems;
  const isOverLimit = items.length > maxItems;

  const updateItem = (index: number, patch: Partial<ItemDraft>) => {
    onChange(
      items.map((item, itemIndex) => {
        if (itemIndex === index) return { ...item, ...patch };
        // Only one tier can be marked as the most chosen.
        if (patch.featured === true) return { ...item, featured: false };

        return item;
      }),
    );
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={STYLE.fieldLabel}>
        {names.plural} ({items.length} of {maxItems})
      </div>

      {items.length === 0 && <div style={STYLE.note}>None yet.</div>}
      {isOverLimit && (
        <div role="alert" style={{ color: DANGER }}>
          Only the first {maxItems} {names.plural.toLowerCase()} show on the page. Remove{' '}
          {items.length - maxItems} to choose which ones show.
        </div>
      )}

      {items.map((item, index) => {
        const position = `${names.singular} ${index + 1}`;

        return (
          <div
            key={index}
            style={{
              border: '1px solid var(--sl-hairline)',
              borderRadius: 'var(--sl-radius-sm)',
              padding: 10,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 600 }}>{position}</div>
            {fields.map((field) =>
              field === 'featured' ? (
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={item.featured}
                    onChange={(event) =>
                      updateItem(index, { featured: event.currentTarget.checked })
                    }
                  />
                  {ITEM_FIELD_LABELS.featured}
                </label>
              ) : (
                <label key={field} style={{ display: 'grid', gap: 4 }}>
                  <span style={STYLE.hint}>{ITEM_FIELD_LABELS[field]}</span>
                  {field === 'text' ? (
                    <textarea
                      value={item.text}
                      rows={2}
                      onChange={(event) =>
                        updateItem(index, { text: event.currentTarget.value })
                      }
                      style={{ ...STYLE.input, height: 'auto', padding: 10, borderRadius: 'var(--sl-radius-sm)' }}
                    />
                  ) : (
                    <input
                      type="text"
                      value={item[field]}
                      onChange={(event) =>
                        updateItem(index, { [field]: event.currentTarget.value })
                      }
                      style={STYLE.input}
                    />
                  )}
                </label>
              ),
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={smallButton}
                disabled={index === 0}
                aria-label={`Move ${position} up`}
                onClick={() => onChange(moveItem(items, index, index - 1))}
              >
                Up
              </button>
              <button
                type="button"
                style={smallButton}
                disabled={index === items.length - 1}
                aria-label={`Move ${position} down`}
                onClick={() => onChange(moveItem(items, index, index + 1))}
              >
                Down
              </button>
              <button
                type="button"
                style={{ ...smallButton, color: DANGER }}
                aria-label={`Remove ${position}`}
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        style={{ ...smallButton, justifySelf: 'start' }}
        disabled={isFull}
        onClick={() => onChange([...items, { ...EMPTY_ITEM }])}
      >
        Add {names.singular.toLowerCase()}
      </button>
      {isFull && !isOverLimit && (
        <div style={STYLE.hint}>
          This section holds up to {maxItems}. Remove one to add another.
        </div>
      )}
    </div>
  );
};

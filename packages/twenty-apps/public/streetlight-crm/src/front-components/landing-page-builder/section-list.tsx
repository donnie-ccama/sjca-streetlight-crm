import { useState, type CSSProperties } from 'react';

import {
  SECTION_TYPE_DESCRIPTIONS,
  SECTION_TYPE_LABELS,
  SINGLE_USE_TYPES,
} from 'src/front-components/landing-page-builder/section-config';
import type { BuilderSection } from 'src/front-components/landing-page-builder/use-builder-state';
import { DANGER, STYLE } from 'src/shared/daily-giving-styles';
import { SECTION_TYPES } from 'src/shared/marketing/sections';
import type { SectionType } from 'src/shared/marketing/types';

type SectionListProps = {
  sections: BuilderSection[];
  selectedId: string | null;
  canAdd: (sectionType: SectionType) => boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (sectionType: SectionType) => void;
};

const smallButton: CSSProperties = {
  ...STYLE.ghostButton,
  minHeight: 28,
  padding: '0 10px',
  fontSize: 12,
};

const rowStyle = (isSelected: boolean, isDropTarget: boolean): CSSProperties => ({
  border: `1px solid ${isSelected ? 'var(--sl-navy)' : 'var(--sl-hairline)'}`,
  borderTop: isDropTarget ? '3px solid var(--sl-navy)' : undefined,
  borderRadius: 'var(--sl-radius-sm)',
  background: isSelected ? 'var(--sl-surface)' : 'var(--sl-bg)',
  padding: 8,
  display: 'grid',
  gap: 6,
});

export const SectionList = ({
  sections,
  selectedId,
  canAdd,
  onSelect,
  onToggleVisible,
  onMove,
  onDuplicate,
  onRemove,
  onAdd,
}: SectionListProps) => {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const endDrag = () => {
    setDraggedId(null);
    setDropIndex(null);
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={STYLE.fieldLabel}>Sections, top to bottom</div>

      {sections.length === 0 && (
        <div style={STYLE.note}>This page has no sections yet. Add one below.</div>
      )}

      {sections.map((section, index) => {
        const isSelected = section.id === selectedId;
        const heading = section.heading.trim();
        const isMenuOpen = menuId === section.id;
        const isConfirmingDelete = confirmDeleteId === section.id;
        const name = heading === '' ? SECTION_TYPE_LABELS[section.sectionType] : heading;

        return (
          <div
            key={section.id}
            draggable
            onDragStart={() => setDraggedId(section.id)}
            onDragOver={(event) => {
              event.preventDefault();
              setDropIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedId !== null) onMove(draggedId, index);
              endDrag();
            }}
            onDragEnd={endDrag}
            style={{
              ...rowStyle(isSelected, dropIndex === index && draggedId !== section.id),
              opacity: draggedId === section.id ? 0.5 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                aria-hidden="true"
                title="Drag to move"
                style={{ cursor: 'grab', color: 'var(--sl-text-secondary)', padding: '0 2px' }}
              >
                ⠿
              </span>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-pressed={isSelected}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  border: 'none',
                  background: 'none',
                  font: 'inherit',
                  color: 'var(--sl-text)',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {SECTION_TYPE_LABELS[section.sectionType]}
                </div>
                <div
                  style={{
                    ...STYLE.hint,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {heading === '' ? 'No heading yet' : heading}
                </div>
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={section.isVisible}
                  onChange={() => onToggleVisible(section.id)}
                  aria-label={`Show ${name} on the page`}
                />
                {section.isVisible ? 'Shown' : 'Hidden'}
              </label>
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={smallButton}
                disabled={index === 0}
                onClick={() => onMove(section.id, index - 1)}
                aria-label={`Move ${name} up`}
              >
                Up
              </button>
              <button
                type="button"
                style={smallButton}
                disabled={index === sections.length - 1}
                onClick={() => onMove(section.id, index + 1)}
                aria-label={`Move ${name} down`}
              >
                Down
              </button>
              <button
                type="button"
                style={smallButton}
                aria-expanded={isMenuOpen}
                aria-label={`More actions for ${name}`}
                onClick={() => {
                  setMenuId(isMenuOpen ? null : section.id);
                  setConfirmDeleteId(null);
                }}
              >
                More…
              </button>
            </div>

            {isMenuOpen && !isConfirmingDelete && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {!SINGLE_USE_TYPES.includes(section.sectionType) && (
                  <button
                    type="button"
                    style={smallButton}
                    onClick={() => {
                      onDuplicate(section.id);
                      setMenuId(null);
                    }}
                  >
                    Duplicate
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...smallButton, color: DANGER }}
                  onClick={() => setConfirmDeleteId(section.id)}
                >
                  Delete
                </button>
              </div>
            )}

            {isConfirmingDelete && (
              <div role="alert" style={{ display: 'grid', gap: 6 }}>
                <div>Delete this section? It leaves the draft when you save.</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    style={{ ...smallButton, background: DANGER, color: '#fff', borderColor: DANGER }}
                    onClick={() => {
                      onRemove(section.id);
                      setConfirmDeleteId(null);
                      setMenuId(null);
                    }}
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    style={smallButton}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        style={{ ...STYLE.secondaryButton, justifySelf: 'start' }}
        aria-expanded={isPickerOpen}
        onClick={() => setIsPickerOpen(!isPickerOpen)}
      >
        {isPickerOpen ? 'Close' : 'Add section'}
      </button>

      {isPickerOpen && (
        <div style={{ display: 'grid', gap: 6 }}>
          {SECTION_TYPES.map((sectionType) => {
            const isAllowed = canAdd(sectionType);

            return (
              <button
                key={sectionType}
                type="button"
                disabled={!isAllowed}
                onClick={() => {
                  onAdd(sectionType);
                  setIsPickerOpen(false);
                }}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--sl-hairline)',
                  borderRadius: 'var(--sl-radius-sm)',
                  background: 'var(--sl-bg)',
                  color: 'var(--sl-text)',
                  font: 'inherit',
                  padding: 8,
                  cursor: isAllowed ? 'pointer' : 'default',
                  opacity: isAllowed ? 1 : 0.55,
                }}
              >
                <div style={{ fontWeight: 600 }}>{SECTION_TYPE_LABELS[sectionType]}</div>
                <div style={STYLE.hint}>
                  {isAllowed
                    ? SECTION_TYPE_DESCRIPTIONS[sectionType]
                    : 'This page already has one. A page can have only one.'}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

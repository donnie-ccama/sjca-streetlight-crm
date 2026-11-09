import type { CSSProperties, ReactNode } from 'react';

import { ItemsEditor } from 'src/front-components/landing-page-builder/items-editor';
import { PhotoField } from 'src/front-components/landing-page-builder/photo-field';
import {
  BUTTON_ACTION_LABELS,
  BUTTON_ACTIONS,
  BUTTON_ACTIONS_BY_TYPE,
  FIELDS_BY_TYPE,
  SECTION_TYPE_DESCRIPTIONS,
  SECTION_TYPE_LABELS,
} from 'src/front-components/landing-page-builder/section-config';
import type {
  BuilderSection,
  ButtonDraft,
  SectionPatch,
} from 'src/front-components/landing-page-builder/use-builder-state';
import { DANGER, STYLE } from 'src/shared/daily-giving-styles';
import {
  DEFAULT_INVITE_MESSAGE,
  INVITE_MESSAGE_LIMIT,
  isHttpsUrl,
} from 'src/shared/marketing/sections';
import type { ButtonAction } from 'src/shared/marketing/types';

type SectionEditorProps = {
  section: BuilderSection;
  photoFieldMetadataId: string | null;
  onChange: (patch: SectionPatch) => void;
  onUploadingChange: (isUploading: boolean) => void;
};

const textAreaStyle: CSSProperties = {
  ...STYLE.input,
  height: 'auto',
  padding: 10,
  borderRadius: 'var(--sl-radius-sm)',
  resize: 'vertical',
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label style={{ display: 'grid', gap: 4 }}>
    <span style={{ fontWeight: 600 }}>{label}</span>
    {children}
    {hint && <span style={STYLE.hint}>{hint}</span>}
  </label>
);

const TextInput = ({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) => (
  <input
    type="text"
    value={value}
    placeholder={placeholder}
    onChange={(event) => onChange(event.currentTarget.value)}
    style={STYLE.input}
  />
);

const ButtonFields = ({
  title,
  button,
  actions = BUTTON_ACTIONS,
  onChange,
}: {
  title: string;
  button: ButtonDraft;
  actions?: ButtonAction[];
  onChange: (button: ButtonDraft) => void;
}) => {
  const showsUrlProblem =
    button.action === 'LINK' && button.url.trim() !== '' && !isHttpsUrl(button.url.trim());

  return (
    <fieldset
      style={{
        border: '1px solid var(--sl-hairline)',
        borderRadius: 'var(--sl-radius-sm)',
        padding: 10,
        margin: 0,
        display: 'grid',
        gap: 8,
      }}
    >
      <legend style={{ fontWeight: 600, padding: '0 4px' }}>{title}</legend>
      <Field label="Button text" hint="Leave empty to hide this button.">
        <TextInput
          value={button.label}
          onChange={(label) => onChange({ ...button, label })}
        />
      </Field>
      <Field label="What the button does">
        <select
          value={button.action ?? ''}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onChange({
              ...button,
              action: value === '' ? null : (value as ButtonAction),
            });
          }}
          style={STYLE.input}
        >
          <option value="">Choose…</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {BUTTON_ACTION_LABELS[action]}
            </option>
          ))}
        </select>
      </Field>
      {button.action === 'LINK' && (
        <Field label="Link address" hint="Must start with https://">
          <TextInput
            value={button.url}
            placeholder="https://"
            onChange={(url) => onChange({ ...button, url })}
          />
        </Field>
      )}
      {showsUrlProblem && (
        <div role="alert" style={{ color: DANGER }}>
          This link must start with https://
        </div>
      )}
    </fieldset>
  );
};

export const SectionEditor = ({
  section,
  photoFieldMetadataId,
  onChange,
  onUploadingChange,
}: SectionEditorProps) => {
  const fields = FIELDS_BY_TYPE[section.sectionType];
  const isQuote = section.sectionType === 'QUOTE';
  const isForm = section.sectionType === 'JOIN' || section.sectionType === 'VOLUNTEER';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h2 style={STYLE.cardTitle}>{SECTION_TYPE_LABELS[section.sectionType]}</h2>
        <div style={STYLE.hint}>{SECTION_TYPE_DESCRIPTIONS[section.sectionType]}</div>
        {!section.isVisible && (
          <div style={{ ...STYLE.hint, color: DANGER }}>
            Hidden: this section does not show on the page.
          </div>
        )}
      </div>

      {fields.includes('photo') && (
        <PhotoField
          photo={section.photo}
          fieldMetadataId={photoFieldMetadataId}
          onChange={(photo) => onChange({ photo })}
          onUploadingChange={onUploadingChange}
        />
      )}

      {fields.includes('eyebrow') && (
        <Field label="Small label above the heading">
          <TextInput value={section.eyebrow} onChange={(eyebrow) => onChange({ eyebrow })} />
        </Field>
      )}

      {fields.includes('heading') && (
        <Field
          label={isQuote ? 'Quote' : 'Heading'}
          hint={
            isQuote
              ? undefined
              : 'Put *stars* around words to show them in the accent color.'
          }
        >
          {isQuote ? (
            <textarea
              value={section.heading}
              rows={3}
              onChange={(event) => onChange({ heading: event.currentTarget.value })}
              style={textAreaStyle}
            />
          ) : (
            <TextInput value={section.heading} onChange={(heading) => onChange({ heading })} />
          )}
        </Field>
      )}

      {fields.includes('text') &&
        (isQuote ? (
          <Field label="Who said it">
            <TextInput value={section.text} onChange={(text) => onChange({ text })} />
          </Field>
        ) : (
          <Field label="Text" hint="Leave a blank line to start a new paragraph.">
            <textarea
              value={section.text}
              rows={5}
              onChange={(event) => onChange({ text: event.currentTarget.value })}
              style={textAreaStyle}
            />
          </Field>
        ))}

      {fields.includes('items') && (
        <ItemsEditor
          sectionType={section.sectionType}
          items={section.items}
          onChange={(items) => onChange({ items })}
        />
      )}

      {fields.includes('primaryButton') && (
        <ButtonFields
          title={section.sectionType === 'HERO' ? 'Main button' : 'Button'}
          button={section.primaryButton}
          actions={BUTTON_ACTIONS_BY_TYPE[section.sectionType]}
          onChange={(primaryButton) => onChange({ primaryButton })}
        />
      )}

      {fields.includes('secondaryButton') && (
        <ButtonFields
          title="Second button"
          button={section.secondaryButton}
          onChange={(secondaryButton) => onChange({ secondaryButton })}
        />
      )}

      {fields.includes('formButtonLabel') && isForm && (
        <Field label="Form button text" hint="Leave empty to use the standard text.">
          <TextInput
            value={section.primaryButton.label}
            placeholder={section.sectionType === 'JOIN' ? 'Join' : 'Volunteer'}
            onChange={(label) =>
              onChange({ primaryButton: { ...section.primaryButton, label } })
            }
          />
        </Field>
      )}

      {fields.includes('inviteButtonLabel') && (
        <Field
          label="Invite button text"
          hint="{friend} shows the friend's first name. Leave empty to use the standard text."
        >
          <TextInput
            value={section.primaryButton.label}
            placeholder="Invite {friend}"
            onChange={(label) =>
              onChange({ primaryButton: { ...section.primaryButton, label } })
            }
          />
        </Field>
      )}

      {fields.includes('inviteMessage') && (
        <Field
          label="Invite message"
          hint={`The text that goes with the link. Up to ${INVITE_MESSAGE_LIMIT} characters. {friend} shows the friend's first name.`}
        >
          <textarea
            value={section.inviteMessage}
            rows={3}
            maxLength={INVITE_MESSAGE_LIMIT}
            placeholder={DEFAULT_INVITE_MESSAGE}
            onChange={(event) => onChange({ inviteMessage: event.currentTarget.value })}
            style={textAreaStyle}
          />
        </Field>
      )}

      {fields.includes('trustLine') && (
        <Field label="Line under the buttons">
          <TextInput value={section.trustLine} onChange={(trustLine) => onChange({ trustLine })} />
        </Field>
      )}

      {fields.includes('badge') && (
        <>
          <Field label="Badge number" hint="A short number on the photo, like 1,200.">
            <TextInput
              value={section.badgeValue}
              onChange={(badgeValue) => onChange({ badgeValue })}
            />
          </Field>
          <Field label="Badge text">
            <TextInput value={section.badgeText} onChange={(badgeText) => onChange({ badgeText })} />
          </Field>
        </>
      )}

      {fields.includes('smallPrint') && (
        <Field
          label={
            section.sectionType === 'THANKS'
              ? 'No thanks link text'
              : 'Small print under the button'
          }
        >
          <TextInput
            value={section.smallPrint}
            onChange={(smallPrint) => onChange({ smallPrint })}
          />
        </Field>
      )}
    </div>
  );
};

import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import {
  MessageChannelContactAutoCreationPolicy,
  MessageChannelType,
  MessageFolderImportPolicy,
} from 'twenty-shared/types';

import { SettingsAccountsMessageChannelDetails } from '@/settings/accounts/components/SettingsAccountsMessageChannelDetails';
import { UPDATE_MESSAGE_CHANNEL } from '@/settings/accounts/graphql/mutations/updateMessageChannel';
import { MessageChannelVisibility } from '~/generated-metadata/graphql';

const messageChannel = {
  id: 'message-channel-id',
  visibility: MessageChannelVisibility.SHARE_EVERYTHING,
  contactAutoCreationPolicy: MessageChannelContactAutoCreationPolicy.SENT,
  isCompanyAutoCreationEnabled: true,
  excludeNonProfessionalEmails: false,
  excludeGroupEmails: false,
  isSyncEnabled: true,
  messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
  type: MessageChannelType.EMAIL,
};

beforeAll(() => {
  // jsdom has no PointerEvent, which the switch dispatches on click
  window.PointerEvent ??= MouseEvent as typeof PointerEvent;
});

it('turns company auto-creation off from the Create companies switch', async () => {
  const updated = jest.fn(() => ({
    data: {
      updateMessageChannel: {
        __typename: 'MessageChannel',
        id: messageChannel.id,
        visibility: messageChannel.visibility,
        contactAutoCreationPolicy: messageChannel.contactAutoCreationPolicy,
        isCompanyAutoCreationEnabled: false,
        excludeNonProfessionalEmails: false,
        excludeGroupEmails: false,
        messageFolderImportPolicy: messageChannel.messageFolderImportPolicy,
      },
    },
  }));

  render(
    <Provider store={createStore()}>
      <MockedProvider
        mocks={[
          {
            request: {
              query: UPDATE_MESSAGE_CHANNEL,
              variables: {
                input: {
                  id: messageChannel.id,
                  update: { isCompanyAutoCreationEnabled: false },
                },
              },
            },
            result: updated,
          },
        ]}
      >
        <I18nProvider i18n={i18n}>
          <SettingsAccountsMessageChannelDetails
            messageChannel={messageChannel}
          />
        </I18nProvider>
      </MockedProvider>
    </Provider>,
  );

  await userEvent.click(
    screen.getByRole('switch', { name: 'Create companies' }),
  );

  await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
});

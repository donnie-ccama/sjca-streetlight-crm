import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { fireEvent, render, screen } from '@testing-library/react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { OrganizationOwnershipBadge } from '@/navigation/components/OrganizationOwnershipBadge';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useIsNavigationDrawerContentExpanded } from '@/ui/navigation/navigation-drawer/hooks/useIsNavigationDrawerContentExpanded';
import {
  mockCurrentWorkspace,
  mockedWorkspaceMemberData,
} from '~/testing/mock-data/users';

jest.mock('@/settings/roles/hooks/useHasPermissionFlag');
jest.mock(
  '@/ui/navigation/navigation-drawer/hooks/useIsNavigationDrawerContentExpanded',
);

const renderBadge = ({
  hasWorkspacePermission = true,
  isExpanded = true,
  logo = null,
}: {
  hasWorkspacePermission?: boolean;
  isExpanded?: boolean;
  logo?: string | null;
} = {}) => {
  const store = createStore();

  store.set(currentWorkspaceState.atom, {
    ...mockCurrentWorkspace,
    displayName: 'Streetlight Community Foundation',
    logo,
    workspaceUrls: {
      customUrl: null,
      subdomainUrl: 'http://localhost:3101',
    },
  });
  store.set(currentWorkspaceMemberState.atom, {
    ...mockedWorkspaceMemberData,
    name: {
      firstName: 'Donnie',
      lastName: 'Lane',
    },
  });

  jest.mocked(useHasPermissionFlag).mockReturnValue(hasWorkspacePermission);
  jest.mocked(useIsNavigationDrawerContentExpanded).mockReturnValue(isExpanded);

  render(
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={store}>
        <OrganizationOwnershipBadge />
      </JotaiProvider>
    </I18nProvider>,
  );
};

describe('OrganizationOwnershipBadge', () => {
  it('shows the organization, CRM URL, administrator, and fallback logo', () => {
    renderBadge({ logo: '' });

    expect(
      screen.getByRole('region', { name: 'Organization ownership' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Streetlight Community Foundation'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'localhost:3101' }),
    ).toHaveAttribute('href', 'http://localhost:3101');
    expect(screen.getByText('Donnie Lane')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Streetlight Community Foundation logo',
      }),
    ).toHaveAttribute(
      'src',
      expect.stringContaining('/images/brand/icon-192.png'),
    );
  });

  it('uses a generic administrator label for members without workspace access', () => {
    renderBadge({ hasWorkspacePermission: false });

    expect(screen.getByText('Workspace administrator')).toBeInTheDocument();
    expect(screen.queryByText('Donnie Lane')).not.toBeInTheDocument();
  });

  it('restores the Streetlight placeholder when an organization logo cannot load', () => {
    renderBadge({ logo: 'https://example.com/missing-logo.svg' });

    const logo = screen.getByRole('img', {
      name: 'Streetlight Community Foundation logo',
    });

    fireEvent.error(logo);

    expect(logo).toHaveAttribute(
      'src',
      expect.stringContaining('/images/brand/icon-192.png'),
    );
  });

  it('keeps the logo visible when the navigation drawer is collapsed', () => {
    renderBadge({ isExpanded: false });

    expect(
      screen.getByRole('img', {
        name: 'Streetlight Community Foundation logo',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Streetlight Community Foundation'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Donnie Lane')).not.toBeInTheDocument();
  });
});

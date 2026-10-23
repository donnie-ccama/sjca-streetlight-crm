import { StreetlightProductHeader } from '@/navigation/components/StreetlightProductHeader';
import { render, screen } from '@testing-library/react';

describe('StreetlightProductHeader', () => {
  it('renders the package light and dark logo assets', () => {
    const { container } = render(<StreetlightProductHeader />);

    expect(
      screen.getByRole('img', { name: 'Streetlight CRM' }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        'img[src="/images/brand/streetlight-crm-logo.svg"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        'img[src="/images/brand/streetlight-crm-logo-white.svg"]',
      ),
    ).toBeInTheDocument();
  });

  it('uses only the white package logo on a dark brand surface', () => {
    const { container } = render(<StreetlightProductHeader darkSurface />);

    expect(
      container.querySelector(
        'img[src="/images/brand/streetlight-crm-logo-white.svg"]',
      ),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('renders the compact app icon when space is constrained', () => {
    const { container } = render(<StreetlightProductHeader compact />);

    expect(
      container.querySelector(
        'img[src="/images/brand/streetlight-crm-app-icon.svg"]',
      ),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });
});

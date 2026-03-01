import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/designSystem', () => ({
  EntranceAnimation: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/modal', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <View>{children}</View> : null,
    ModalBackdrop: (props: any) => <Pressable {...props} />,
    ModalContent: (props: any) => <View {...props} />,
    ModalBody: (props: any) => <View {...props} />,
  };
});

import { UrlChoiceModal } from '@/components/preview/UrlChoiceModal';

describe('preview/UrlChoiceModal', () => {
  it('calls choose handlers and cancel', () => {
    const onChooseOriginal = jest.fn();
    const onChooseVpn = jest.fn();
    const onCancel = jest.fn();

    const { getByText, getByLabelText } = render(
      <UrlChoiceModal
        isOpen
        title="Choose URL"
        description="Pick one"
        originalUrl="http://localhost:3000"
        vpnUrl="https://example.trycloudflare.com"
        onChooseOriginal={onChooseOriginal}
        onChooseVpn={onChooseVpn}
        onCancel={onCancel}
      />
    );

    fireEvent.press(getByText('Use VPN URL'));
    fireEvent.press(getByText('Keep original'));
    fireEvent.press(getByLabelText('Cancel'));

    expect(onChooseVpn).toHaveBeenCalledTimes(1);
    expect(onChooseOriginal).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

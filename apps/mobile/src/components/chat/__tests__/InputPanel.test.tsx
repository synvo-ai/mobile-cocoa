import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => { };
  return {
    ...Reanimated,
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
    FadeOut: { duration: () => ({ delay: () => ({}) }) },
    ZoomIn: { duration: () => ({ springify: () => ({ damping: () => ({ stiffness: () => ({}) }) }) }) },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/designSystem', () => ({
  triggerHaptic: jest.fn(),
  EntranceAnimation: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/icons/ProviderIcons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = () => <View />;
  return {
    ClaudeSendIcon: Icon,
    AntigravitySendIcon: Icon,
    CodexSendIcon: Icon,
    CodexEnterIcon: Icon,
  };
});

jest.mock('@/components/icons/ChatActionIcons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = () => <View />;
  return {
    AttachPlusIcon: Icon,
    ChevronDownIcon: Icon,
    ChevronUpIcon: Icon,
    CloseIcon: Icon,
    DockerIcon: Icon,
    GlobeIcon: Icon,
    SkillIcon: Icon,
    VibeIcon: Icon,
    StopCircleIcon: Icon,
    TerminalIcon: Icon,
  };
});

jest.mock('@/components/ui/actionsheet', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');

  return {
    Actionsheet: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <View>{children}</View> : null,
    ActionsheetBackdrop: (props: any) => <Pressable {...props} />,
    ActionsheetContent: (props: any) => <View {...props} />,
    ActionsheetItem: ({ onPress, children, ...props }: any) => (
      <Pressable onPress={onPress} {...props}>
        {children}
      </Pressable>
    ),
    ActionsheetItemText: (props: any) => <Text {...props} />,
    ActionsheetDragIndicator: (props: any) => <View {...props} />,
    ActionsheetDragIndicatorWrapper: (props: any) => <View {...props} />,
  };
});

import { InputPanel } from '@/components/chat/InputPanel';

describe('chat/InputPanel', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false as never);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submits prompt and dismisses keyboard', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByLabelText } = render(
      <InputPanel
        connected
        sessionRunning={false}
        waitingForUserInput={false}
        isAutoApproveToolConfirm
        onAutoApproveToolConfirmChange={jest.fn()}
        permissionMode={null}
        onSubmit={onSubmit}
      />
    );

    fireEvent.changeText(getByPlaceholderText('How can I help you today?'), 'hello world');
    fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('hello world', undefined);
    });
    expect(Keyboard.dismiss).toHaveBeenCalled();
  });

  it('opens actionsheet and triggers skill callback', async () => {
    const onOpenSkillsConfig = jest.fn();
    const { getByLabelText } = render(
      <InputPanel
        connected
        sessionRunning={false}
        waitingForUserInput={false}
        isAutoApproveToolConfirm
        onAutoApproveToolConfirmChange={jest.fn()}
        permissionMode={null}
        onSubmit={jest.fn()}
        onOpenSkillsConfig={onOpenSkillsConfig}
      />
    );

    fireEvent.press(getByLabelText('Skill Hub'));
    await waitFor(() => {
      expect(getByLabelText('Skill Hub').props.accessibilityState?.expanded).toBe(true);
    });
  });
});

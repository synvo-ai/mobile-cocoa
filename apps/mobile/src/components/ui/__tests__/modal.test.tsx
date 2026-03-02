import { render } from '@testing-library/react-native';
import type { Ref } from 'react';
import React from 'react';

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

jest.mock('@gluestack-ui/core/modal/creator', () => {
  const React = require('react');
  const { View, Pressable, ScrollView } = require('react-native');

  const createPart = (Tag: React.ComponentType<any>) =>
    React.forwardRef((props: any, ref: Ref<unknown>) => <Tag ref={ref} {...props} />);

  const ModalRoot = React.forwardRef((props: any, ref: Ref<unknown>) => (
    <View ref={ref} {...props} />
  ));
  ModalRoot.Backdrop = createPart(Pressable);
  ModalRoot.Content = createPart(View);
  ModalRoot.Body = createPart(ScrollView);
  ModalRoot.CloseButton = createPart(Pressable);
  ModalRoot.Footer = createPart(View);
  ModalRoot.Header = createPart(View);

  return {
    createModal: () => ModalRoot,
  };
});

jest.mock('uniwind', () => ({
  withUniwind: (Component: React.ComponentType<any>) => Component,
}));

import { Modal } from '@/components/ui/modal';

describe('ui/modal', () => {
  it('passes isOpen through to modal root', () => {
    const { getByTestId } = render(
      <Modal testID="modal" isOpen />
    );

    expect(getByTestId('modal').props.isOpen).toBe(true);
  });

  it('passes onClose through to modal root', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Modal testID="modal" isOpen onClose={onClose} />
    );

    expect(getByTestId('modal').props.onClose).toBe(onClose);
  });
});

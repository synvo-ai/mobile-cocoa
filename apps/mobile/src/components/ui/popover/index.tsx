'use client';
import { createPopover } from '@gluestack-ui/core/popover/creator';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { tva, useStyleContext, withStyleContext } from '@gluestack-ui/utils/nativewind-utils';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';
import React from 'react';
import { Pressable, ScrollView, View, ViewStyle } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SCOPE = 'POPOVER';

const MotionView = Animated.View;

const StyledAnimatedPressable = withUniwind(AnimatedPressable);
const StyledMotionView = withUniwind(MotionView);

const UIPopover = createPopover({
  Root: withStyleContext(View, SCOPE),
  Arrow: StyledMotionView,
  Backdrop: StyledAnimatedPressable,
  Body: ScrollView,
  CloseButton: Pressable,
  Content: StyledMotionView,
  Footer: View,
  Header: View,
  AnimatePresence: (props: any) => props.children,
});

const popoverStyle = tva({
  base: 'group/popover w-full h-full justify-center items-center web:pointer-events-none',
  variants: {
    size: {
      xs: '',
      sm: '',
      md: '',
      lg: '',
      full: '',
    },
  },
});

const popoverArrowStyle = tva({
  base: 'bg-background-0 z-[1] border absolute overflow-hidden h-3.5 w-3.5 border-outline-100',
  variants: {
    placement: {
      'top left':
        'data-[flip=false]:border-t-0 data-[flip=false]:border-l-0 data-[flip=true]:border-b-0 data-[flip=true]:border-r-0',
      'top':
        'data-[flip=false]:border-t-0 data-[flip=false]:border-l-0 data-[flip=true]:border-b-0 data-[flip=true]:border-r-0',
      'top right':
        'data-[flip=false]:border-t-0 data-[flip=false]:border-l-0 data-[flip=true]:border-b-0 data-[flip=true]:border-r-0',
      'bottom':
        'data-[flip=false]:border-b-0 data-[flip=false]:border-r-0 data-[flip=true]:border-t-0 data-[flip=true]:border-l-0',
      'bottom left':
        'data-[flip=false]:border-b-0 data-[flip=false]:border-r-0 data-[flip=true]:border-t-0 data-[flip=true]:border-l-0',
      'bottom right':
        'data-[flip=false]:border-b-0 data-[flip=false]:border-r-0 data-[flip=true]:border-t-0 data-[flip=true]:border-l-0',
      'left':
        'data-[flip=false]:border-l-0 data-[flip=false]:border-b-0 data-[flip=true]:border-r-0 data-[flip=true]:border-t-0',
      'left top':
        'data-[flip=false]:border-l-0 data-[flip=false]:border-b-0 data-[flip=true]:border-r-0 data-[flip=true]:border-t-0',
      'left bottom':
        'data-[flip=false]:border-l-0 data-[flip=false]:border-b-0 data-[flip=true]:border-r-0 data-[flip=true]:border-t-0',
      'right':
        'data-[flip=false]:border-r-0 data-[flip=false]:border-t-0 data-[flip=true]:border-l-0 data-[flip=true]:border-b-0',
      'right top':
        'data-[flip=false]:border-r-0 data-[flip=false]:border-t-0 data-[flip=true]:border-l-0 data-[flip=true]:border-b-0',
      'right bottom':
        'data-[flip=false]:border-r-0 data-[flip=false]:border-t-0 data-[flip=true]:border-l-0 data-[flip=true]:border-b-0',
    },
  },
});

const popoverBackdropStyle = tva({
  base: 'absolute left-0 top-0 right-0 bottom-0 web:cursor-default',
});

const popoverCloseButtonStyle = tva({
  base: 'group/popover-close-button z-[1] rounded-sm data-[focus-visible=true]:web:bg-background-100 web:outline-0 web:cursor-pointer',
});

const popoverContentStyle = tva({
  base: 'bg-background-0 rounded-lg overflow-hidden border border-outline-100 w-full',
  parentVariants: {
    size: {
      xs: 'max-w-[360px] p-3.5',
      sm: 'max-w-[420px] p-4',
      md: 'max-w-[510px] p-[18px]',
      lg: 'max-w-[640px] p-5',
      full: 'p-6',
    },
  },
});

const popoverHeaderStyle = tva({
  base: 'flex-row justify-between items-center',
});

const popoverBodyStyle = tva({
  base: '',
});

const popoverFooterStyle = tva({
  base: 'flex-row justify-between items-center',
});

type IPopoverProps = React.ComponentProps<typeof UIPopover> &
  VariantProps<typeof popoverStyle> & { className?: string };

type IPopoverArrowProps = React.ComponentProps<typeof UIPopover.Arrow> &
  VariantProps<typeof popoverArrowStyle> & { className?: string };

type IPopoverContentProps = React.ComponentProps<typeof UIPopover.Content> &
  VariantProps<typeof popoverContentStyle> & { className?: string };

type IPopoverHeaderProps = React.ComponentProps<typeof UIPopover.Header> &
  VariantProps<typeof popoverHeaderStyle> & { className?: string };

type IPopoverFooterProps = React.ComponentProps<typeof UIPopover.Footer> &
  VariantProps<typeof popoverFooterStyle> & { className?: string };

type IPopoverBodyProps = React.ComponentProps<typeof UIPopover.Body> &
  VariantProps<typeof popoverBodyStyle> & { className?: string };

type IPopoverBackdropProps = React.ComponentProps<typeof UIPopover.Backdrop> &
  VariantProps<typeof popoverBackdropStyle> & { className?: string };

type IPopoverCloseButtonProps = React.ComponentProps<
  typeof UIPopover.CloseButton
> &
  VariantProps<typeof popoverCloseButtonStyle> & { className?: string };

const Popover = React.forwardRef<
  React.ComponentRef<typeof UIPopover>,
  IPopoverProps
>(function Popover(
  { className, size = 'md', placement = 'bottom', ...props },
  ref
) {
  return (
    <UIPopover
      ref={ref}
      placement={placement}
      {...props}
      className={popoverStyle({ size, class: className })}
      context={{ size, placement }}
      pointerEvents="box-none"
    />
  );
});

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof UIPopover.Content>,
  IPopoverContentProps
>(function PopoverContent({ className, size, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);

  return (
    <UIPopover.Content
      ref={ref}
      entering={FadeIn.duration(350).delay(50)}
      exiting={FadeOut.duration(250)}
      {...props}
      className={popoverContentStyle({
        parentVariants: {
          size: parentSize,
        },
        size,
        class: className,
      })}
      pointerEvents="auto"
    />
  );
});

const PopoverArrow = React.forwardRef<
  React.ComponentRef<typeof UIPopover.Arrow>,
  IPopoverArrowProps
>(function PopoverArrow({ className, ...props }, ref) {
  const { placement } = useStyleContext(SCOPE);
  return (
    <UIPopover.Arrow
      ref={ref}
      entering={FadeIn.duration(350).delay(50)}
      exiting={FadeOut.duration(250)}
      {...props}
      className={popoverArrowStyle({
        class: className,
        placement,
      })}
    />
  );
});

import { StyleSheet } from 'react-native';

const PopoverBackdrop = React.forwardRef<
  React.ComponentRef<typeof UIPopover.Backdrop>,
  IPopoverBackdropProps
>(function PopoverBackdrop({ className, style, ...props }, ref) {
  return (
    <UIPopover.Backdrop
      ref={ref}
      {...props}
      entering={FadeIn.duration(350).delay(50)}
      exiting={FadeOut.duration(250)}
      className={popoverBackdropStyle({
        class: className,
      })}
      style={
        style
          ? [StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0)' }, style as any]
          : [StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0)' }]
      }
    />
  );
});

const PopoverBody = React.forwardRef<
  React.ComponentRef<typeof UIPopover.Body>,
  IPopoverBodyProps
>(function PopoverBody({ className, ...props }, ref) {
  return (
    <UIPopover.Body
      ref={ref}
      {...props}
      className={popoverBodyStyle({
        class: className,
      })}
    />
  );
});

const PopoverCloseButton = React.forwardRef<
  React.ComponentRef<typeof UIPopover.CloseButton>,
  IPopoverCloseButtonProps
>(function PopoverCloseButton({ className, ...props }, ref) {
  return (
    <UIPopover.CloseButton
      ref={ref}
      {...props}
      className={popoverCloseButtonStyle({
        class: className,
      })}
    />
  );
});

const PopoverFooter = React.forwardRef<
  React.ComponentRef<typeof UIPopover.Footer>,
  IPopoverFooterProps
>(function PopoverFooter({ className, ...props }, ref) {
  return (
    <UIPopover.Footer
      ref={ref}
      {...props}
      className={popoverFooterStyle({
        class: className,
      })}
    />
  );
});

const PopoverHeader = React.forwardRef<
  React.ComponentRef<typeof UIPopover.Header>,
  IPopoverHeaderProps
>(function PopoverHeader({ className, ...props }, ref) {
  return (
    <UIPopover.Header
      ref={ref}
      {...props}
      className={popoverHeaderStyle({
        class: className,
      })}
    />
  );
});

Popover.displayName = 'Popover';
PopoverArrow.displayName = 'PopoverArrow';
PopoverBackdrop.displayName = 'PopoverBackdrop';
PopoverContent.displayName = 'PopoverContent';
PopoverHeader.displayName = 'PopoverHeader';
PopoverFooter.displayName = 'PopoverFooter';
PopoverBody.displayName = 'PopoverBody';
PopoverCloseButton.displayName = 'PopoverCloseButton';

export {
  Popover,
  PopoverBackdrop,
  PopoverArrow,
  PopoverCloseButton,
  PopoverFooter,
  PopoverHeader,
  PopoverBody,
  PopoverContent,
};

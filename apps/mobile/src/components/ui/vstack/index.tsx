import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { vstackStyle } from '@/components/ui/vstack/styles';

type IVStackProps = React.ComponentProps<typeof View> &
  VariantProps<typeof vstackStyle> & {
    className?: string; // vstackStyle variant props includes space and reversed
  };

const VStack = React.forwardRef<React.ComponentRef<typeof View>, IVStackProps>(
  function VStack(
    { className, space, reversed, style, ...props },
    ref
  ) {
    return (
      <View
        className={vstackStyle({
          space,
          reversed,
          class: className,
        })}
        style={style as StyleProp<ViewStyle>}
        {...props}
        ref={ref}
      />
    );
  }
);

VStack.displayName = 'VStack';

export { VStack };

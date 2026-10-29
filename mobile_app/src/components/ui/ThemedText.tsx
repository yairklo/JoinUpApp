import React from 'react';
import { Text, type TextProps } from 'react-native';
import { usePalette } from '@/theme/palette';

/** RN Text whose default colour follows the colour mode; an explicit `color` in `style` still wins. */
export default function ThemedText({ style, ...rest }: TextProps) {
    const P = usePalette();
    return <Text {...rest} style={[{ color: P.text }, style]} />;
}

import React from 'react';
import { Image } from 'react-native';
import { useColorMode } from '@/theme/ColorModeContext';

// Artwork from design/brand/joinup-logo-kit (light = #047857/#D9480F, dark = #10B981/#F2672A:
// #047857 is only 3.4:1 on the dark background).
const ASSETS = {
    lockup: {
        light: require('../../assets/images/brand/lockup-light.png'),
        dark: require('../../assets/images/brand/lockup-dark.png'),
        aspect: 900 / 218,
    },
    symbol: {
        light: require('../../assets/images/brand/symbol-light.png'),
        dark: require('../../assets/images/brand/symbol-dark.png'),
        aspect: 1,
    },
} as const;

interface BrandLogoProps {
    variant?: 'lockup' | 'symbol';
    /** Rendered height in dp; width follows the artwork's aspect ratio. */
    height: number;
    /** Force a palette (e.g. screens with a fixed white background); defaults to the app colour mode. */
    mode?: 'light' | 'dark';
}

export default function BrandLogo({ variant = 'lockup', height, mode }: BrandLogoProps) {
    const { colorMode } = useColorMode();
    const asset = ASSETS[variant];
    const source = (mode ?? colorMode) === 'dark' ? asset.dark : asset.light;
    return (
        <Image
            source={source}
            style={{ height, width: height * asset.aspect }}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="JoinUp"
        />
    );
}

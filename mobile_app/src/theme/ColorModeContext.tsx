import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppColorMode, initColorMode, toggleColorMode as toggleColorModeNative } from './colorMode';
// NativeWind's `dark:` classes are resolved from this internal observable, not from our own
// state and not (reliably) from RN's Appearance module -- see syncNativewind() below.
import { systemColorScheme as nativewindColorScheme } from 'react-native-css-interop/dist/runtime/native/appearance-observables';

interface ColorModeContextValue {
    colorMode: AppColorMode;
    toggleColorMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

/**
 * NativeWind's `dark:` classes read react-native-css-interop's own internal
 * `systemColorScheme` observable, which it only ever updates from RN's native
 * Appearance "change" event. On this app's Android build, Appearance.setColorScheme()
 * does not reliably update Appearance.getColorScheme() or fire that event (confirmed
 * via on-device testing), so `dark:` classes never followed a manual toggle. Setting
 * this observable directly forces every `dark:` class to follow our own state instead,
 * bypassing that broken native round-trip entirely. There's no public API for this --
 * react-native-css-interop's own exported `colorScheme.set()`/`toggleColorScheme()`
 * still only forward to native Appearance under the hood.
 */
function syncNativewind(mode: AppColorMode) {
    try {
        nativewindColorScheme.set(mode);
    } catch (e) {
        console.error('NativeWind color scheme sync error:', e);
    }
}

/**
 * Source of truth for the app's dark/light mode, kept in JS state instead of
 * react-native's Appearance.getColorScheme()/useColorScheme(). On this app's
 * Android build, Appearance.setColorScheme() does not reliably update what
 * Appearance.getColorScheme() reports back (confirmed via on-device testing),
 * so anything reading useColorScheme() after a manual toggle stays stuck on
 * the old value. Tracking our own state sidesteps that native round-trip.
 */
export function ColorModeProvider({ children }: { children: React.ReactNode }) {
    const [colorMode, setColorMode] = useState<AppColorMode>('light');

    useEffect(() => {
        initColorMode()
            .then((mode) => {
                syncNativewind(mode);
                setColorMode(mode);
            })
            .catch((e) => console.error('Color mode init error:', e));
    }, []);

    const toggleColorMode = useCallback(() => {
        setColorMode((current) => {
            const next: AppColorMode = current === 'dark' ? 'light' : 'dark';
            toggleColorModeNative(current).catch((e) => console.error('Color mode toggle error:', e));
            syncNativewind(next);
            return next;
        });
    }, []);

    return (
        <ColorModeContext.Provider value={{ colorMode, toggleColorMode }}>
            {children}
        </ColorModeContext.Provider>
    );
}

export function useColorMode(): ColorModeContextValue {
    const ctx = useContext(ColorModeContext);
    if (!ctx) throw new Error('useColorMode must be used within a ColorModeProvider');
    return ctx;
}

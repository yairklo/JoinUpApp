import { useColorMode } from '@/theme/ColorModeContext';

/**
 * Colours for screens that are styled with inline `style` objects (no NativeWind `dark:` classes).
 * Values match the tailwind `cyber-*` / gray scale used elsewhere. Prefer `dark:` classes in new code.
 */
export const LIGHT_PALETTE = {
    surface: '#ffffff',
    cardBorder: '#e5e7eb',
    inputBorder: '#d1d5db',
    inputBg: '#f9fafb',
    chipBg: '#f3f4f6',
    neutralBg: '#e5e7eb',
    brandBg: '#ecfdf5',
    infoBg: '#eff6ff',
    okBg: '#f0fdf4',
    warnBg: '#fff7ed',
    warnText: '#9a3412',
    text: '#111827',
    text2: '#374151',
    muted: '#6b7280',
    muted2: '#4b5563',
    darkBtn: '#111827',
} as const;

export const DARK_PALETTE: { [K in keyof typeof LIGHT_PALETTE]: string } = {
    surface: '#0b1220',
    cardBorder: '#1e293b',
    inputBorder: '#334155',
    inputBg: '#111a2c',
    chipBg: '#1e293b',
    neutralBg: '#1e293b',
    brandBg: '#022c22',
    infoBg: '#172554',
    okBg: '#052e16',
    warnBg: '#431407',
    warnText: '#fdba74',
    text: '#f1f5f9',
    text2: '#cbd5e1',
    muted: '#94a3b8',
    muted2: '#94a3b8',
    darkBtn: '#334155',
};

export type Palette = typeof DARK_PALETTE;

export function usePalette(): Palette {
    const { colorMode } = useColorMode();
    return colorMode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

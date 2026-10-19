import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SPORT_THEME } from '@joinup/shared/sports';

export type SportThemeKey = keyof typeof SPORT_THEME;

/** Normalizes any sport string to a SPORT_THEME key, falling back to SOCCER. */
export function resolveSportKey(sport?: string | null): SportThemeKey {
    const key = String(sport || '').toUpperCase();
    return key in SPORT_THEME ? (key as SportThemeKey) : 'SOCCER';
}

export function getSportTheme(sport?: string | null) {
    return SPORT_THEME[resolveSportKey(sport)];
}

export const SPORT_GLYPH: Record<SportThemeKey, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
    SOCCER: 'soccer',
    BASKETBALL: 'basketball',
    TENNIS: 'tennis',
};

const LINE = 'rgba(255,255,255,0.16)';
const LINE_W = 1.5;

interface SportCoverProps {
    sport?: string | null;
    height: number;
    borderRadius?: number;
    style?: StyleProp<ViewStyle>;
    /** Overlay content, laid out over the full cover area. */
    children?: React.ReactNode;
}

/** Absolutely positioned line/box helper — percentages relative to the court box. */
function Box({ style }: { style: ViewStyle }) {
    return <View pointerEvents="none" style={[{ position: 'absolute', borderColor: LINE }, style]} />;
}

function Circle({ cx, cy, d }: { cx: DimensionValue; cy: DimensionValue; d: number }) {
    // Centered on (cx, cy) via negative margins so cx may be a percentage.
    return (
        <Box
            style={{
                left: cx,
                top: cy,
                width: d,
                height: d,
                marginLeft: -d / 2,
                marginTop: -d / 2,
                borderRadius: d / 2,
                borderWidth: LINE_W,
            }}
        />
    );
}

function SoccerLines({ h }: { h: number }) {
    return (
        <>
            {/* halfway line */}
            <Box style={{ left: '50%', top: 0, bottom: 0, borderLeftWidth: LINE_W }} />
            <Circle cx="50%" cy="50%" d={h * 0.36} />
            {/* penalty boxes */}
            <Box style={{ left: 0, top: '22%', height: '56%', width: '15%', borderWidth: LINE_W, borderLeftWidth: 0 }} />
            <Box style={{ right: 0, top: '22%', height: '56%', width: '15%', borderWidth: LINE_W, borderRightWidth: 0 }} />
            {/* goal boxes */}
            <Box style={{ left: 0, top: '37%', height: '26%', width: '6%', borderWidth: LINE_W, borderLeftWidth: 0 }} />
            <Box style={{ right: 0, top: '37%', height: '26%', width: '6%', borderWidth: LINE_W, borderRightWidth: 0 }} />
        </>
    );
}

function BasketballLines({ h }: { h: number }) {
    const arc = h * 0.95;
    return (
        <>
            <Box style={{ left: '50%', top: 0, bottom: 0, borderLeftWidth: LINE_W }} />
            <Circle cx="50%" cy="50%" d={h * 0.3} />
            {/* three-point arcs (clipped by the court's overflow) */}
            <Circle cx="5%" cy="50%" d={arc} />
            <Circle cx="95%" cy="50%" d={arc} />
            {/* key / paint */}
            <Box style={{ left: 0, top: '33%', height: '34%', width: '19%', borderWidth: LINE_W, borderLeftWidth: 0 }} />
            <Box style={{ right: 0, top: '33%', height: '34%', width: '19%', borderWidth: LINE_W, borderRightWidth: 0 }} />
            <Circle cx="19%" cy="50%" d={h * 0.24} />
            <Circle cx="81%" cy="50%" d={h * 0.24} />
        </>
    );
}

function TennisLines() {
    return (
        <>
            {/* singles sidelines */}
            <Box style={{ left: 0, right: 0, top: '12.5%', borderTopWidth: LINE_W }} />
            <Box style={{ left: 0, right: 0, bottom: '12.5%', borderBottomWidth: LINE_W }} />
            {/* net */}
            <Box style={{ left: '50%', top: -6, bottom: -6, borderLeftWidth: LINE_W * 1.5 }} />
            {/* service lines */}
            <Box style={{ left: '23%', top: '12.5%', bottom: '12.5%', borderLeftWidth: LINE_W }} />
            <Box style={{ left: '77%', top: '12.5%', bottom: '12.5%', borderLeftWidth: LINE_W }} />
            {/* center service line */}
            <Box style={{ left: '23%', right: '23%', top: '50%', borderTopWidth: LINE_W }} />
        </>
    );
}

/**
 * Generated per-sport cover: diagonal gradient (deep → ink), faint court
 * markings, a soft corner glow and a large faint sport glyph. Replaces the
 * stock sport photos on cards and the game-details hero.
 */
export default function SportCover({ sport, height, borderRadius = 0, style, children }: SportCoverProps) {
    const key = resolveSportKey(sport);
    const theme = SPORT_THEME[key];
    const inset = Math.max(10, Math.round(height * 0.1));
    const courtH = height - inset * 2;
    const glow = height * 1.1;

    return (
        <View style={[{ height, borderRadius, overflow: 'hidden', backgroundColor: theme.ink }, style]}>
            <LinearGradient
                colors={[theme.deep, theme.ink]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Soft corner glow — layered circles approximate a radial falloff (~35% peak). */}
            <View pointerEvents="none" style={{ position: 'absolute', top: -glow / 2, end: -glow / 2, width: glow, height: glow }}>
                {[1, 0.72, 0.46].map((scale, i) => {
                    const d = glow * scale;
                    return (
                        <View
                            key={i}
                            style={{
                                position: 'absolute',
                                width: d,
                                height: d,
                                borderRadius: d / 2,
                                left: (glow - d) / 2,
                                top: (glow - d) / 2,
                                backgroundColor: theme.glow,
                                opacity: 0.3,
                            }}
                        />
                    );
                })}
            </View>

            {/* Court markings */}
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: inset,
                    bottom: inset,
                    left: inset,
                    right: inset,
                    borderWidth: LINE_W,
                    borderColor: LINE,
                    borderRadius: 4,
                    overflow: 'hidden',
                }}
            >
                {key === 'SOCCER' && <SoccerLines h={courtH} />}
                {key === 'BASKETBALL' && <BasketballLines h={courtH} />}
                {key === 'TENNIS' && <TennisLines />}
            </View>

            {/* Big faint glyph bleeding off the bottom-end corner */}
            <View pointerEvents="none" style={{ position: 'absolute', bottom: -height * 0.28, end: -height * 0.18, opacity: 0.2 }}>
                <MaterialCommunityIcons name={SPORT_GLYPH[key]} size={height * 0.95} color="#ffffff" />
            </View>

            {children != null && <View style={StyleSheet.absoluteFill}>{children}</View>}
        </View>
    );
}

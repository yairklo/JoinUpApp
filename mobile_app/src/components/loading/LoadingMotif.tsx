import React, { useEffect, useState, type ReactNode, type JSX } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import type { LoadingMotifId } from "@joinup/shared";

const BRAND = "#059669";
const BOUNCE_HEIGHT = 46;
const HALF_DURATION = 450;

export type MotifProps = { label?: string; size?: number };

function useReduceMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled?.()
            .then((v) => mounted && setReduced(Boolean(v)))
            .catch(() => {});
        const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => setReduced(Boolean(v)));
        return () => {
            mounted = false;
            sub?.remove?.();
        };
    }, []);
    return reduced;
}

function MotifShell({ children, label }: { children: ReactNode; label?: string }) {
    return (
        <View style={{ alignItems: "center", gap: 10 }}>
            {children}
            {label ? (
                <Text style={{ color: "#64748b", fontWeight: "600", fontSize: 14 }}>{label}</Text>
            ) : null}
        </View>
    );
}

/** Brand-green ball matching next_app's SoccerBallGlyph (no emoji, no extra native dep). */
export function SoccerBallGlyph({ size = 40 }: { size?: number }) {
    const seamLen = size * 0.42;
    const seamW = Math.max(1.5, size * 0.035);
    const pent = size * 0.22;
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 2,
                borderColor: BRAND,
                backgroundColor: "rgba(5,150,105,0.12)",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
            }}
        >
            {[0, 72, 144, 216, 288].map((deg) => (
                <View
                    key={deg}
                    style={{
                        position: "absolute",
                        width: seamW,
                        height: seamLen,
                        backgroundColor: BRAND,
                        borderRadius: 99,
                        transform: [{ rotate: `${deg}deg` }, { translateY: -seamLen * 0.28 }],
                    }}
                />
            ))}
            <View
                style={{
                    width: pent,
                    height: pent,
                    backgroundColor: BRAND,
                    transform: [{ rotate: "18deg" }],
                }}
            />
        </View>
    );
}

function MapPinGlyph({ size = 32 }: { size?: number }) {
    const head = size * 0.62;
    return (
        <View style={{ alignItems: "center", width: size }}>
            <View
                style={{
                    width: head,
                    height: head,
                    borderRadius: head / 2,
                    backgroundColor: BRAND,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <View
                    style={{
                        width: head * 0.36,
                        height: head * 0.36,
                        borderRadius: 99,
                        backgroundColor: "#fff",
                    }}
                />
            </View>
            <View
                style={{
                    width: 0,
                    height: 0,
                    marginTop: -2,
                    borderLeftWidth: head * 0.28,
                    borderRightWidth: head * 0.28,
                    borderTopWidth: size * 0.38,
                    borderLeftColor: "transparent",
                    borderRightColor: "transparent",
                    borderTopColor: BRAND,
                }}
            />
        </View>
    );
}

function PlayerDot({ size = 12 }: { size?: number }) {
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: BRAND,
                shadowColor: BRAND,
                shadowOpacity: 0.35,
                shadowRadius: 4,
            }}
        />
    );
}

export function BouncingBallMotif({ label, size = 40 }: MotifProps) {
    const reduced = useReduceMotion();
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const shadowScale = useSharedValue(1);

    useEffect(() => {
        if (reduced) {
            cancelAnimation(translateY);
            cancelAnimation(rotate);
            cancelAnimation(shadowScale);
            translateY.value = 0;
            rotate.value = 0;
            shadowScale.value = 1;
            return;
        }
        translateY.value = withRepeat(
            withSequence(
                withTiming(-BOUNCE_HEIGHT, { duration: HALF_DURATION, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: HALF_DURATION, easing: Easing.in(Easing.quad) })
            ),
            -1,
            false
        );
        shadowScale.value = withRepeat(
            withSequence(
                withTiming(0.5, { duration: HALF_DURATION, easing: Easing.out(Easing.quad) }),
                withTiming(1, { duration: HALF_DURATION, easing: Easing.in(Easing.quad) })
            ),
            -1,
            false
        );
        rotate.value = withRepeat(withTiming(360, { duration: HALF_DURATION * 2, easing: Easing.linear }), -1, false);
    }, [reduced, rotate, shadowScale, translateY]);

    const ballStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
    }));
    const shadowStyle = useAnimatedStyle(() => ({
        transform: [{ scaleX: shadowScale.value }],
        opacity: 0.1 + (1 - shadowScale.value) * 0.15,
    }));

    return (
        <MotifShell label={label}>
            <View style={{ width: size, height: BOUNCE_HEIGHT + size, alignItems: "center", justifyContent: "flex-end" }}>
                {reduced ? (
                    <SoccerBallGlyph size={size} />
                ) : (
                    <>
                        <Animated.View style={[ballStyle, { position: "absolute", bottom: 8 }]}>
                            <SoccerBallGlyph size={size} />
                        </Animated.View>
                        <Animated.View
                            style={[
                                shadowStyle,
                                {
                                    width: size * 0.8,
                                    height: 8,
                                    borderRadius: 999,
                                    backgroundColor: "#000000",
                                },
                            ]}
                        />
                    </>
                )}
            </View>
        </MotifShell>
    );
}

export function PassingLaneMotif({ label, size = 32 }: MotifProps) {
    const reduced = useReduceMotion();
    const progress = useSharedValue(0);
    const travel = 56;

    useEffect(() => {
        if (reduced) {
            cancelAnimation(progress);
            progress.value = 0.5;
            return;
        }
        progress.value = 0;
        progress.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    }, [reduced, progress]);

    const ballStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress.value, [0, 0.25, 0.5, 0.75, 1], [-travel, 0, travel, 0, -travel]) },
            { translateY: interpolate(progress.value, [0, 0.25, 0.5, 0.75, 1], [0, -30, 0, -30, 0]) },
            { rotate: `${interpolate(progress.value, [0, 1], [0, 360])}deg` },
        ],
    }));
    const leftKick = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(progress.value, [0, 0.08, 0.16, 0.5, 1], [1, 1.25, 1, 1, 1]) }],
    }));
    const rightKick = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(progress.value, [0, 0.42, 0.5, 0.58, 1], [1, 1, 1.25, 1, 1]) }],
    }));

    return (
        <MotifShell label={label}>
            <View style={{ width: travel * 2 + size, height: size + 40, justifyContent: "flex-end" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <Animated.View style={leftKick}>
                        <PlayerDot />
                    </Animated.View>
                    <Animated.View style={rightKick}>
                        <PlayerDot />
                    </Animated.View>
                </View>
                <Animated.View
                    style={[
                        {
                            position: "absolute",
                            left: travel,
                            top: 8,
                        },
                        ballStyle,
                    ]}
                >
                    <SoccerBallGlyph size={size} />
                </Animated.View>
            </View>
        </MotifShell>
    );
}

function RippleRing({ delayMs, reduced, diameter }: { delayMs: number; reduced: boolean; diameter: number }) {
    const scale = useSharedValue(0.45);
    const opacity = useSharedValue(0.5);

    useEffect(() => {
        if (reduced) {
            cancelAnimation(scale);
            cancelAnimation(opacity);
            scale.value = 1;
            opacity.value = 0.18;
            return;
        }
        const t = setTimeout(() => {
            scale.value = 0.45;
            opacity.value = 0.5;
            scale.value = withRepeat(withTiming(2.05, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
            opacity.value = withRepeat(withTiming(0, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
        }, delayMs);
        return () => clearTimeout(t);
    }, [reduced, delayMs, opacity, scale]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    width: diameter,
                    height: diameter,
                    borderRadius: diameter / 2,
                    borderWidth: 2,
                    borderColor: BRAND,
                },
                style,
            ]}
        />
    );
}

export function KickoffRippleMotif({ label, size = 40 }: MotifProps) {
    const reduced = useReduceMotion();
    const frame = size * 2.2;
    return (
        <MotifShell label={label}>
            <View style={{ width: frame, height: frame, alignItems: "center", justifyContent: "center" }}>
                <RippleRing delayMs={0} reduced={reduced} diameter={size * 1.15} />
                <RippleRing delayMs={450} reduced={reduced} diameter={size * 1.15} />
                <RippleRing delayMs={900} reduced={reduced} diameter={size * 1.15} />
                <SoccerBallGlyph size={size} />
            </View>
        </MotifShell>
    );
}

export function DribbleMotif({ label, size = 36 }: MotifProps) {
    const reduced = useReduceMotion();
    const progress = useSharedValue(0);
    const travel = 34;

    useEffect(() => {
        if (reduced) {
            cancelAnimation(progress);
            progress.value = 0.5;
            return;
        }
        progress.value = 0;
        progress.value = withRepeat(withTiming(1, { duration: 1150, easing: Easing.linear }), -1, false);
    }, [reduced, progress]);

    const ballStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress.value, [0, 0.5, 1], [-travel, travel, -travel]) },
            { translateY: interpolate(progress.value, [0, 0.25, 0.5, 0.75, 1], [0, -size * 0.95, 0, -size * 0.95, 0]) },
            { rotate: `${interpolate(progress.value, [0, 1], [0, 360])}deg` },
        ],
    }));
    const shadowStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress.value, [0, 0.5, 1], [-travel, travel, -travel]) },
            { scaleX: interpolate(progress.value, [0, 0.25, 0.5, 0.75, 1], [1, 0.55, 1, 0.55, 1]) },
        ],
        opacity: interpolate(progress.value, [0, 0.25, 0.5], [0.28, 0.1, 0.28]),
    }));

    return (
        <MotifShell label={label}>
            <View style={{ width: travel * 2 + size, height: size * 1.9, alignItems: "center", justifyContent: "flex-end" }}>
                {reduced ? (
                    <SoccerBallGlyph size={size} />
                ) : (
                    <>
                        <Animated.View style={[{ position: "absolute", bottom: 8 }, ballStyle]}>
                            <SoccerBallGlyph size={size} />
                        </Animated.View>
                        <Animated.View
                            style={[
                                {
                                    width: size * 0.8,
                                    height: 7,
                                    borderRadius: 99,
                                    backgroundColor: "#000",
                                    marginBottom: 2,
                                },
                                shadowStyle,
                            ]}
                        />
                    </>
                )}
            </View>
        </MotifShell>
    );
}

function PulseHalo({ delayMs, reduced }: { delayMs: number; reduced: boolean }) {
    const scale = useSharedValue(0.7);
    const opacity = useSharedValue(0.28);

    useEffect(() => {
        if (reduced) {
            cancelAnimation(scale);
            cancelAnimation(opacity);
            scale.value = 1;
            opacity.value = 0.08;
            return;
        }
        const t = setTimeout(() => {
            scale.value = 0.7;
            opacity.value = 0.28;
            scale.value = withRepeat(withTiming(1.7, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
            opacity.value = withRepeat(withTiming(0, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
        }, delayMs);
        return () => clearTimeout(t);
    }, [reduced, delayMs, opacity, scale]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: BRAND,
                },
                style,
            ]}
        />
    );
}

export function BrandPulseMotif({ label }: MotifProps) {
    const reduced = useReduceMotion();
    return (
        <MotifShell label={label}>
            <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
                <PulseHalo delayMs={0} reduced={reduced} />
                <PulseHalo delayMs={400} reduced={reduced} />
                <View
                    style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        backgroundColor: BRAND,
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1,
                    }}
                >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: -0.5 }}>JU</Text>
                </View>
            </View>
        </MotifShell>
    );
}

export function PinDropMotif({ label, size = 32 }: MotifProps) {
    const reduced = useReduceMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            cancelAnimation(progress);
            progress.value = 1;
            return;
        }
        progress.value = 0;
        progress.value = withRepeat(withTiming(1, { duration: 1350, easing: Easing.linear }), -1, false);
    }, [reduced, progress]);

    const pinStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(progress.value, [0, 0.45, 0.7, 1], [-36, 0, -8, 0]) },
            { scaleY: interpolate(progress.value, [0, 0.45, 0.7, 1], [1, 0.88, 1.04, 1]) },
        ],
    }));
    const shadowStyle = useAnimatedStyle(() => ({
        transform: [{ scaleX: interpolate(progress.value, [0, 0.45, 0.7, 1], [0.35, 1, 0.7, 1]) }],
        opacity: interpolate(progress.value, [0, 0.45, 0.7, 1], [0.05, 0.28, 0.16, 0.28]),
    }));

    return (
        <MotifShell label={label}>
            <View style={{ width: size + 16, height: size * 1.7, alignItems: "center", justifyContent: "flex-end" }}>
                {reduced ? (
                    <MapPinGlyph size={size} />
                ) : (
                    <>
                        <Animated.View style={[{ position: "absolute", bottom: 10 }, pinStyle]}>
                            <MapPinGlyph size={size} />
                        </Animated.View>
                        <Animated.View
                            style={[
                                {
                                    width: size * 0.7,
                                    height: 8,
                                    borderRadius: 99,
                                    backgroundColor: "#000",
                                    marginBottom: 2,
                                },
                                shadowStyle,
                            ]}
                        />
                    </>
                )}
            </View>
        </MotifShell>
    );
}

export function MessageStackMotif({ label }: MotifProps) {
    const reduced = useReduceMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            cancelAnimation(progress);
            progress.value = 1;
            return;
        }
        progress.value = 0;
        progress.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, false);
    }, [reduced, progress]);

    const first = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.25, 0.7, 1], [0.25, 1, 1, 0.25]),
        transform: [{ translateX: interpolate(progress.value, [0, 0.25, 0.7, 1], [10, 0, 0, 10]) }],
    }));
    const second = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.2, 0.4, 0.75, 1], [0.2, 0.2, 1, 1, 0.2]),
        transform: [{ translateX: interpolate(progress.value, [0, 0.2, 0.4, 0.75, 1], [-10, -10, 0, 0, -10]) }],
    }));

    const incoming = { width: 58, height: 26, borderRadius: 10, backgroundColor: "#e2e8f0" };
    const outgoing = { width: 72, height: 26, borderRadius: 10, backgroundColor: BRAND, alignSelf: "flex-end" as const };

    return (
        <MotifShell label={label}>
            <View style={{ width: 92, gap: 8 }}>
                {reduced ? (
                    <>
                        <View style={incoming} />
                        <View style={outgoing} />
                    </>
                ) : (
                    <>
                        <Animated.View style={[incoming, first]} />
                        <Animated.View style={[outgoing, second]} />
                    </>
                )}
            </View>
        </MotifShell>
    );
}

function WaveDot({ index, reduced }: { index: number; reduced: boolean }) {
    const y = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            cancelAnimation(y);
            y.value = 0;
            return;
        }
        const t = setTimeout(() => {
            y.value = withRepeat(
                withSequence(
                    withTiming(-16, { duration: 280, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })
                ),
                -1,
                false
            );
        }, index * 100);
        return () => clearTimeout(t);
    }, [reduced, index, y]);

    const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

    return (
        <Animated.View
            style={[
                {
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: BRAND,
                    opacity: reduced ? 0.55 + index * 0.08 : 1,
                },
                style,
            ]}
        />
    );
}

export function CrowdWaveMotif({ label }: MotifProps) {
    const reduced = useReduceMotion();
    return (
        <MotifShell label={label}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 36 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                    <WaveDot key={i} index={i} reduced={reduced} />
                ))}
            </View>
        </MotifShell>
    );
}

const MOTIF_COMPONENTS: Record<LoadingMotifId, (props: MotifProps) => JSX.Element> = {
    "bouncing-ball": BouncingBallMotif,
    "passing-lane": PassingLaneMotif,
    "kickoff-ripple": KickoffRippleMotif,
    dribble: DribbleMotif,
    "brand-pulse": BrandPulseMotif,
    "pin-drop": PinDropMotif,
    "message-stack": MessageStackMotif,
    "crowd-wave": CrowdWaveMotif,
};

export default function LoadingMotif({
    id,
    label,
    size,
}: {
    id: LoadingMotifId;
    label?: string;
    size?: number;
}) {
    const Comp = MOTIF_COMPONENTS[id] ?? BouncingBallMotif;
    return <Comp label={label} size={size} />;
}

export function PageLoading({
    id = "bouncing-ball",
    label,
}: {
    id?: LoadingMotifId;
    label?: string;
}) {
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <LoadingMotif id={id} label={label} />
        </View>
    );
}

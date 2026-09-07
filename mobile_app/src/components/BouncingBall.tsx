import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

const BOUNCE_HEIGHT = 46;
const HALF_DURATION = 450;

/**
 * Bouncing soccer-ball loading indicator, the mobile counterpart of
 * next_app's BouncingBall (games/[id]/loading.tsx). Mirrors its bounce
 * timing/easing so the two platforms feel the same. Falls back to a static
 * ball when the OS "reduce motion" accessibility setting is on.
 */
export default function BouncingBall({ size = 40 }: { size?: number }) {
    const [reduced, setReduced] = useState(false);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const shadowScale = useSharedValue(1);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled?.()
            .then((v) => mounted && setReduced(v))
            .catch(() => {});
        const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => setReduced(v));
        return () => {
            mounted = false;
            sub?.remove?.();
        };
    }, []);

    useEffect(() => {
        if (reduced) return;
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
    }, [reduced]);

    const ballStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
    }));
    const shadowStyle = useAnimatedStyle(() => ({
        transform: [{ scaleX: shadowScale.value }],
        opacity: 0.1 + (1 - shadowScale.value) * 0.15,
    }));

    return (
        <View style={{ width: size, height: BOUNCE_HEIGHT + size, alignItems: "center", justifyContent: "flex-end" }}>
            {reduced ? (
                <Text style={{ fontSize: size }}>⚽</Text>
            ) : (
                <>
                    <Animated.View style={[ballStyle, { position: "absolute", bottom: 8 }]}>
                        <Text style={{ fontSize: size }}>⚽</Text>
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
    );
}

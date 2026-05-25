import React, { useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import { useOAuth } from "@clerk/clerk-expo";
import { TouchableOpacity, Text, View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

WebBrowser.maybeCompleteAuthSession();

export function OAuth() {
    const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

    const onPress = useCallback(async () => {
        try {
            const { createdSessionId, setActive } = await startOAuthFlow();

            if (createdSessionId) {
                setActive!({ session: createdSessionId });
            }
        } catch (err) {
            console.error("OAuth error", err);
        }
    }, [startOAuthFlow]);

    return (
        <View className="w-full mt-6">
            <View className="flex-row items-center mb-6">
                <View className="flex-1 h-[1px] bg-gray-200" />
                <Text className="mx-4 text-gray-400 font-medium">OR</Text>
                <View className="flex-1 h-[1px] bg-gray-200" />
            </View>

            <TouchableOpacity
                onPress={onPress}
                className="w-full flex-row items-center justify-center bg-white border border-gray-200 p-4 rounded-2xl shadow-sm active:bg-gray-50"
            >
                <FontAwesome name="google" size={20} color="#DB4437" />
                <Text className="ml-3 text-gray-700 font-bold text-lg">Continue with Google</Text>
            </TouchableOpacity>
        </View>
    );
}

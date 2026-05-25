import { useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { Text, TextInput, View, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { OAuth } from "@/components/OAuth";

export default function Page() {
    const { signIn, setActive, isLoaded } = useSignIn();
    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const onSignInPress = async () => {
        if (!isLoaded) return;
        setLoading(true);

        try {
            const completeSignIn = await signIn.create({
                identifier: emailAddress,
                password,
            });

            if (completeSignIn.status === "complete") {
                await setActive({ session: completeSignIn.createdSessionId });
                router.replace("/(tabs)");
            } else {
                console.error(JSON.stringify(completeSignIn, null, 2));
            }
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2));
            alert("Login failed: " + (err.errors?.[0]?.message || "Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-8">
                    <View className="flex-1 justify-center py-10">
                        <View className="items-center mb-12">
                            <View className="w-20 h-20 bg-blue-600 rounded-3xl items-center justify-center shadow-lg shadow-blue-200 mb-6">
                                <Text className="text-white text-4xl font-black">J</Text>
                            </View>
                            <Text className="text-4xl font-black text-gray-900 mb-2">JoinUp</Text>
                            <Text className="text-gray-500 font-medium text-lg text-center">
                                Connect, Play, and Enjoy the Game
                            </Text>
                        </View>

                        <View className="space-y-5">
                            <View>
                                <Text className="text-gray-800 font-semibold mb-2 ml-1">Email</Text>
                                <TextInput
                                    autoCapitalize="none"
                                    value={emailAddress}
                                    placeholder="your@email.com"
                                    onChangeText={(email) => setEmailAddress(email)}
                                    className="w-full bg-gray-50 p-5 rounded-2xl border border-gray-100 text-gray-900"
                                />
                            </View>

                            <View>
                                <Text className="text-gray-800 font-semibold mb-2 ml-1">Password</Text>
                                <TextInput
                                    value={password}
                                    placeholder="••••••••"
                                    secureTextEntry={true}
                                    onChangeText={(password) => setPassword(password)}
                                    className="w-full bg-gray-50 p-5 rounded-2xl border border-gray-100 text-gray-900"
                                />
                            </View>

                            <TouchableOpacity
                                onPress={onSignInPress}
                                disabled={loading}
                                className={`w-full p-5 rounded-2xl items-center mt-4 bg-blue-600 shadow-lg shadow-blue-200 ${loading ? 'opacity-70' : ''}`}
                            >
                                <Text className="text-white font-bold text-lg">
                                    {loading ? "Signing in..." : "Sign In"}
                                </Text>
                            </TouchableOpacity>

                            <OAuth />

                            <View className="flex-row justify-center mt-8 pb-10">
                                <Text className="text-gray-500 font-medium">Don't have an account? </Text>
                                <Link href="/sign-up">
                                    <Text className="text-blue-600 font-bold">Sign Up</Text>
                                </Link>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

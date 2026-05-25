import * as React from 'react'
import { Text, TextInput, TouchableOpacity, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSignUp } from '@clerk/clerk-expo'
import { useRouter, Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { OAuth } from "@/components/OAuth";

export default function SignUpScreen() {
    const { isLoaded, signUp, setActive } = useSignUp()
    const router = useRouter()

    const [emailAddress, setEmailAddress] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [pendingVerification, setPendingVerification] = React.useState(false)
    const [code, setCode] = React.useState('')
    const [loading, setLoading] = React.useState(false)

    const onSignUpPress = async () => {
        if (!isLoaded) return
        setLoading(true)

        try {
            await signUp.create({
                emailAddress,
                password,
            })

            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })

            setPendingVerification(true)
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2))
            alert(err.errors?.[0]?.message || "Sign up failed")
        } finally {
            setLoading(false)
        }
    }

    const onPressVerify = async () => {
        if (!isLoaded) return
        setLoading(true)

        try {
            const completeSignUp = await signUp.attemptEmailAddressVerification({
                code,
            })

            if (completeSignUp.status === 'complete') {
                await setActive({ session: completeSignUp.createdSessionId })
                router.replace('/(tabs)')
            } else {
                console.error(JSON.stringify(completeSignUp, null, 2))
            }
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2))
            alert(err.errors?.[0]?.message || "Verification failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <SafeAreaView className="flex-1 bg-white">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-8">
                    {!pendingVerification ? (
                        <View className="flex-1 justify-center py-10">
                            <View className="items-center mb-10">
                                <View className="w-16 h-16 bg-blue-600 rounded-2xl items-center justify-center shadow-lg shadow-blue-200 mb-6">
                                    <Text className="text-white text-3xl font-black">J</Text>
                                </View>
                                <Text className="text-4xl font-black text-gray-900 mb-2">Create Account</Text>
                                <Text className="text-gray-500 font-medium text-lg">Join the JoinUp community!</Text>
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
                                    onPress={onSignUpPress}
                                    disabled={loading}
                                    className={`w-full p-5 rounded-2xl items-center mt-4 bg-blue-600 shadow-lg shadow-blue-200 ${loading ? 'opacity-70' : ''}`}
                                >
                                    <Text className="text-white font-bold text-lg">
                                        {loading ? "Creating account..." : "Sign Up"}
                                    </Text>
                                </TouchableOpacity>

                                <OAuth />

                                <View className="flex-row justify-center mt-8 pb-10">
                                    <Text className="text-gray-500 font-medium">Already have an account? </Text>
                                    <Link href="/sign-in">
                                        <Text className="text-blue-600 font-bold">Sign In</Text>
                                    </Link>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <View className="flex-1 justify-center py-10">
                            <View className="items-center mb-10">
                                <View className="w-16 h-16 bg-blue-100 rounded-2xl items-center justify-center mb-6">
                                    <Text className="text-blue-600 text-3xl font-black">✉️</Text>
                                </View>
                                <Text className="text-3xl font-black text-gray-900 mb-2">Verify Email</Text>
                                <Text className="text-center text-gray-500 font-medium text-lg">
                                    We sent a code to{"\n"}
                                    <Text className="text-gray-900 font-bold">{emailAddress}</Text>
                                </Text>
                            </View>

                            <View className="space-y-6">
                                <TextInput
                                    value={code}
                                    placeholder="000000"
                                    onChangeText={(code) => setCode(code)}
                                    className="w-full bg-gray-50 p-6 rounded-2xl border border-gray-100 text-center text-3xl font-black tracking-widest text-gray-900"
                                    keyboardType="numeric"
                                    maxLength={6}
                                />

                                <TouchableOpacity
                                    onPress={onPressVerify}
                                    disabled={loading}
                                    className={`w-full p-5 rounded-2xl items-center bg-blue-600 shadow-lg shadow-blue-200 ${loading ? 'opacity-70' : ''}`}
                                >
                                    <Text className="text-white font-bold text-lg">
                                        {loading ? "Checking..." : "Verify Email"}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setPendingVerification(false)}
                                    className="items-center mt-4"
                                >
                                    <Text className="text-blue-600 font-bold">Change Email</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}

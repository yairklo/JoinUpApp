import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

/**
 * Admin hub — entry point for the screens under app/admin/*, gated by
 * app/admin/_layout.tsx. Mirrors the two admin destinations that exist on
 * web (next_app/src/app/admin/fields, next_app/src/app/admin/moderation).
 */
export default function AdminHubScreen() {
    const router = useRouter();

    const items: { title: string; subtitle: string; icon: keyof typeof FontAwesome.glyphMap; href: '/admin/fields' | '/admin/moderation' }[] = [
        { title: 'ניהול מגרשים', subtitle: 'הוספה, עריכה ומחיקה של מגרשים', icon: 'map-marker', href: '/admin/fields' },
        { title: 'ניהול תוכן ודיווחים', subtitle: 'תגובות ודיווחי ליקויים שדווחו, חסימת משתמשים', icon: 'shield', href: '/admin/moderation' },
    ];

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>ניהול</Text>
            </View>

            <View className="p-4" style={{ gap: 12 }}>
                {items.map((item) => (
                    <TouchableOpacity
                        key={item.href}
                        onPress={() => router.push(item.href)}
                        className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl p-4"
                    >
                        <View className="w-10 h-10 rounded-full bg-brand items-center justify-center mr-3">
                            <FontAwesome name={item.icon} size={16} color="#fff" />
                        </View>
                        <View className="flex-1">
                            <Text className="font-bold text-gray-900">{item.title}</Text>
                            <Text className="text-gray-500 text-xs mt-0.5">{item.subtitle}</Text>
                        </View>
                        <FontAwesome name="chevron-left" size={14} color="#9ca3af" />
                    </TouchableOpacity>
                ))}
            </View>
        </SafeAreaView>
    );
}

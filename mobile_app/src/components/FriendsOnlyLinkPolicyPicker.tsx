import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FriendsOnlyLinkPolicy } from '@/types/game';

type Props = {
    value: FriendsOnlyLinkPolicy;
    onChange: (value: FriendsOnlyLinkPolicy) => void;
};

const OPTIONS: { value: FriendsOnlyLinkPolicy; labelKey: string; hintKey: string }[] = [
    { value: 'REQUEST_TO_JOIN', labelKey: 'friendsOnly.requestToJoin', hintKey: 'friendsOnly.requestToJoinHint' },
    { value: 'BLOCKED', labelKey: 'friendsOnly.blocked', hintKey: 'friendsOnly.blockedHint' },
];

// What a friends-only game's / group's link does for people who aren't the organizer's friends.
export default function FriendsOnlyLinkPolicyPicker({ value, onChange }: Props) {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'he';
    const align = isRtl ? 'text-right' : 'text-left';

    return (
        <View>
            <Text className={`text-gray-800 font-bold text-sm mb-2 ${align}`}>{t('friendsOnly.linkPolicyTitle')}</Text>
            {OPTIONS.map((o) => {
                const selected = value === o.value;
                return (
                    <TouchableOpacity
                        key={o.value}
                        onPress={() => onChange(o.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        className={`flex-row items-start p-3 mb-2 rounded-lg border ${selected ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 bg-white'} ${isRtl ? 'flex-row-reverse' : ''}`}
                    >
                        <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mt-0.5 ${selected ? 'border-emerald-600' : 'border-gray-400'}`}>
                            {selected && <View className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
                        </View>
                        <View className={`flex-1 ${isRtl ? 'mr-3' : 'ml-3'}`}>
                            <Text className={`text-gray-900 font-semibold text-sm ${align}`}>{t(o.labelKey)}</Text>
                            <Text className={`text-gray-500 text-xs mt-0.5 ${align}`}>{t(o.hintKey)}</Text>
                        </View>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

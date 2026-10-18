import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LEGAL_IS_DRAFT, getLegalTexts } from '@joinup/shared/legal';

/** Renders the Terms / Privacy document from shared/legal.js in the app language (same text as the website). */
export default function LegalDocumentView({ kind }: { kind: 'terms' | 'privacy' }) {
    const { i18n } = useTranslation();
    const texts = getLegalTexts(i18n.language);
    const doc = texts[kind];
    const isEn = texts.lang === 'en';
    const dirStyle = { textAlign: isEn ? ('left' as const) : ('right' as const), writingDirection: texts.dir };

    return (
        <ScrollView className="flex-1 bg-white dark:bg-gray-950 px-6 py-6" contentContainerStyle={{ paddingBottom: 48 }}>
            <Text className="text-gray-500 dark:text-gray-400 text-sm mb-3" style={dirStyle}>
                {texts.lastUpdatedLabel}: {texts.lastUpdated}
            </Text>
            {LEGAL_IS_DRAFT && (
                <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-5">
                    <Text className="text-amber-800 dark:text-amber-200 text-sm" style={dirStyle}>
                        {isEn ? 'This document is under legal review and may change.' : 'נוסח המסמך נמצא בבדיקה משפטית ועשוי להתעדכן.'}
                    </Text>
                </View>
            )}

            {doc.intro.map((p, i) => (
                <Text key={i} className="text-gray-800 dark:text-gray-200 text-base mb-3" style={dirStyle}>{p}</Text>
            ))}

            {doc.sections.map((section) => (
                <View key={section.heading} className="mt-3">
                    <Text className="text-gray-900 dark:text-white font-bold text-lg mb-2" style={dirStyle}>{section.heading}</Text>
                    {section.blocks.map((block, i) =>
                        'ul' in block ? (
                            <View key={i} className="mb-3">
                                {block.ul.map((item, j) => (
                                    <Text key={j} className="text-gray-700 dark:text-gray-300 mb-2" style={dirStyle}>• {item}</Text>
                                ))}
                            </View>
                        ) : (
                            <Text key={i} className="text-gray-700 dark:text-gray-300 mb-3" style={dirStyle}>{block.p}</Text>
                        )
                    )}
                </View>
            ))}
        </ScrollView>
    );
}

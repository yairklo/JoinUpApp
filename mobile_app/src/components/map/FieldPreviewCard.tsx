import React from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import FavoriteButton from '@/components/FavoriteButton';
import { getSportColorHex, getSportIconName } from '@/utils/mapSport';
import { SPORT_MAPPING } from '@/utils/sports';

export interface PreviewField {
    id: string;
    name: string;
    location?: string | null;
    city?: string | null;
    image?: string | null;
    supportedSports?: string[];
    type?: 'open' | 'closed';
    price?: number;
}

interface FieldPreviewCardProps {
    field: PreviewField;
    /** Tapping anywhere on the card (outside the close button/switcher) navigates to the field profile. */
    onPress: () => void;
    onClose: () => void;
    /** Other courts sharing this exact spot (a multi-court venue) — shows the 1-of-N switcher when >1. */
    clusterFields?: PreviewField[];
    clusterIndex?: number;
    onSelectClusterField?: (index: number) => void;
    /** An extra prominent CTA shown above the "view profile" footer (e.g. "open a game here"). */
    primaryAction?: { label: string; onPress: () => void };
}

/**
 * Floating field preview card shown over the map on marker tap. Shared by the fields map
 * (mobile_app/app/(tabs)/fields.tsx) and the games map's empty-field tap (search.tsx) so
 * both look and behave the same way instead of drifting into separate designs.
 */
export default function FieldPreviewCard({
    field,
    onPress,
    onClose,
    clusterFields,
    clusterIndex = 0,
    onSelectClusterField,
    primaryAction,
}: FieldPreviewCardProps) {
    const { t } = useTranslation();

    return (
        <View
            style={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                right: 16,
                zIndex: 99,
                elevation: 20,
            }}
            pointerEvents="box-none"
        >
            <TouchableOpacity
                activeOpacity={0.95}
                onPress={onPress}
                style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    borderRadius: 20,
                    padding: 14,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 12,
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                }}
            >
                {/* Cluster Court Switcher if multiple courts at this pin */}
                {clusterFields && clusterFields.length > 1 && (
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 10,
                            paddingBottom: 8,
                            borderBottomWidth: 1,
                            borderBottomColor: '#f3f4f6',
                        }}
                    >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
                            {t('field.clusterCourtsCount', { current: clusterIndex + 1, total: clusterFields.length })}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                            {clusterFields.map((f, idx) => (
                                <TouchableOpacity
                                    key={f.id}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        onSelectClusterField?.(idx);
                                    }}
                                    style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 3,
                                        borderRadius: 8,
                                        backgroundColor: clusterIndex === idx ? '#059669' : '#f3f4f6',
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 'bold',
                                            color: clusterIndex === idx ? '#ffffff' : '#6b7280',
                                        }}
                                    >
                                        {idx + 1}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {/* Thumbnail or sport icon */}
                    <View style={{ position: 'relative' }}>
                        {field.image ? (
                            <Image
                                source={{ uri: field.image }}
                                style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: '#f3f4f6' }}
                            />
                        ) : (
                            <View
                                style={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: 14,
                                    backgroundColor: getSportColorHex(field.supportedSports?.[0]) + '18',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <MaterialCommunityIcons
                                    name={getSportIconName(field.supportedSports?.[0]) as any}
                                    size={28}
                                    color={getSportColorHex(field.supportedSports?.[0])}
                                />
                            </View>
                        )}
                        <View style={{ position: 'absolute', top: -5, right: -5 }}>
                            <FavoriteButton fieldId={field.id} size={13} />
                        </View>
                    </View>

                    {/* Info Column */}
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <Text
                            style={{ fontSize: 16, fontWeight: 'bold', color: '#111827', textAlign: 'left' }}
                            numberOfLines={1}
                        >
                            {field.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <FontAwesome name="map-marker" size={12} color="#9ca3af" style={{ marginRight: 4 }} />
                            <Text
                                style={{ fontSize: 13, color: '#6b7280', flex: 1, textAlign: 'left' }}
                                numberOfLines={1}
                            >
                                {field.location || field.city || t('field.israel', 'ישראל')}
                            </Text>
                        </View>

                        {/* Badges */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 5, flexWrap: 'wrap' }}>
                            {field.supportedSports?.[0] && (
                                <View style={{ backgroundColor: '#ecfdf5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0' }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>
                                        {t('sports.' + field.supportedSports[0].toLowerCase(), SPORT_MAPPING[field.supportedSports[0]] || field.supportedSports[0])}
                                    </Text>
                                </View>
                            )}
                            <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#4b5563' }}>
                                    {field.type === 'closed' ? t('field.closedField', 'מגרש מקורה') : t('field.openField', 'מגרש פתוח')}
                                </Text>
                            </View>
                            {typeof field.price === 'number' && field.price > 0 ? (
                                <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                                        {t('field.pricePerHour', { price: field.price })}
                                    </Text>
                                </View>
                            ) : (
                                <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                                        {t('field.freePrice', 'חינם')}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Close Button */}
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            backgroundColor: '#f3f4f6',
                            alignItems: 'center',
                            justifyContent: 'center',
                            alignSelf: 'flex-start',
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Close preview"
                        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    >
                        <FontAwesome name="times" size={13} color="#6b7280" />
                    </TouchableOpacity>
                </View>

                {/* Extra primary CTA (e.g. "open a game here"), above the view-profile footer */}
                {primaryAction && (
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            primaryAction.onPress();
                        }}
                        style={{
                            marginTop: 10,
                            backgroundColor: '#059669',
                            paddingVertical: 10,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 'bold' }}>{primaryAction.label}</Text>
                    </TouchableOpacity>
                )}

                {/* Bottom Action Row */}
                <View
                    style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: '#f3f4f6',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <Text style={{ fontSize: 12, color: '#9ca3af', fontWeight: '500' }}>
                        {t('field.tapToViewDetails', 'לפרטים מלאים והזמנה')}
                    </Text>
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: '#059669',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 10,
                        }}
                    >
                        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold', marginRight: 5 }}>
                            {t('field.viewProfile', 'לפרופיל המגרש')}
                        </Text>
                        <FontAwesome name="arrow-left" size={10} color="#ffffff" />
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}

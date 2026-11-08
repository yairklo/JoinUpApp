import React from "react";
import { Modal, View, Text, TouchableOpacity, FlatList } from "react-native";
import { useTranslation } from "react-i18next";

import { eligibleSuccessors, type AdminCandidate } from "@/utils/successors";

export { eligibleSuccessors };
export type { AdminCandidate };

export default function SuccessorPickerModal({
    visible,
    candidates,
    onPick,
    onCancel,
}: {
    visible: boolean;
    candidates: AdminCandidate[];
    onPick: (successorId: string) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
            <View className="flex-1 justify-center bg-black/40 px-6">
                <View className="bg-white rounded-2xl p-4 max-h-96">
                    <Text className="text-lg font-bold mb-1">{t("game.appointAdminTitle")}</Text>
                    <Text className="text-gray-600 mb-3">{t("game.appointAdminBody")}</Text>
                    {candidates.length === 0 ? (
                        <Text className="text-gray-500 py-3">{t("game.appointAdminNone")}</Text>
                    ) : (
                        <FlatList
                            data={candidates}
                            keyExtractor={(c) => c.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    onPress={() => onPick(item.id)}
                                    className="py-3 border-b border-gray-100"
                                >
                                    <Text className="text-base">{item.name || t("common.user", { defaultValue: "User" })}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                    <TouchableOpacity accessibilityRole="button" onPress={onCancel} className="pt-3 items-center">
                        <Text className="text-gray-600 font-bold">{t("common.cancel")}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

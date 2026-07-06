import { View, Text, ScrollView, TouchableOpacity, Alert, Image, Modal, TextInput } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { gamesApi } from '@/services/api';
import { Game, Team, GameParticipant } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mock colors for teams
const TEAM_COLORS = [
    { name: "Orange", hex: "#f97316" },
    { name: "Blue", hex: "#3b82f6" },
    { name: "Red", hex: "#ef4444" },
    { name: "Green", hex: "#22c55e" },
    { name: "Yellow", hex: "#eab308" },
    { name: "Purple", hex: "#a855f7" },
    { name: "Black", hex: "#1f2937" },
    { name: "Teal", hex: "#14b8a6" },
];

export default function TeamBuilderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [game, setGame] = useState<Game | null>(null);

    const [teams, setTeams] = useState<Team[]>([]);
    const [participants, setParticipants] = useState<GameParticipant[]>([]);
    const [managers, setManagers] = useState<any[]>([]);

    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

    const isOrganizer = game?.organizerId === user?.id;

    useEffect(() => {
        fetchGame();
    }, [id]);

    const fetchGame = async () => {
        try {
            const token = await getToken();
            const data = await gamesApi.getById(id, token || undefined);
            setGame(data);
            setParticipants(data.participants || []);
            setManagers(data.managers || []);
            setTeams(data.teams && data.teams.length > 0 ? data.teams : [
                { id: "t1", name: "Team A", color: "#f97316", playerIds: [] },
                { id: "t2", name: "Team B", color: "#3b82f6", playerIds: [] },
            ]);
        } catch (error) {
            console.error("Failed to load game", error);
            Alert.alert("Error", "Failed to load game");
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await getToken();
            if (!token) return;

            // Use the dedicated saveTeams endpoint
            await gamesApi.saveTeams(id, teams, token);

            Alert.alert(t('success', 'הצלחה'), t('teams.saved', 'הקבוצות נשמרו!'), [{ text: t('ok', 'אישור'), onPress: () => router.back() }]);
        } catch (error) {
            console.error("Failed to save teams", error);
            Alert.alert(t('error', 'שגיאה'), t('teams.saveFailed', 'שגיאה בשמירת קבוצות'));
        } finally {
            setSaving(false);
        }
    };

    const handleToggleManager = async (playerId: string, isCurrentlyManager: boolean) => {
        try {
            const token = await getToken();
            if (!token) return;
            if (isCurrentlyManager) {
                await gamesApi.removeManager(id, playerId, token);
                setManagers(prev => prev.filter(m => m.id !== playerId));
            } else {
                await gamesApi.addManager(id, playerId, token);
                setManagers(prev => [...prev, { id: playerId }]);
            }
        } catch (err) {
            console.error('Failed to update manager', err);
            Alert.alert(t('error', 'שגיאה'), t('teams.managerUpdateFailed', 'עדכון מנהל נכשל'));
        }
    };

    const handleAddTeam = () => {
        const newId = `t${Date.now()}`;
        const usedColors = new Set(teams.map((t) => t.color));
        const nextColor = TEAM_COLORS.find((c) => !usedColors.has(c.hex))?.hex || "#6b7280";
        setTeams([...teams, { id: newId, name: `${t('teams.team', 'קבוצה')} ${teams.length + 1}`, color: nextColor, playerIds: [] }]);
    };

    const handleRemoveTeam = (teamId: string) => {
        setTeams(teams.filter(t => t.id !== teamId));
    };

    const handleAssignToTeam = (teamId: string) => {
        if (!selectedPlayerId) return;

        setTeams(prev => {
            const clean = prev.map(t => ({
                ...t,
                playerIds: t.playerIds.filter(pid => pid !== selectedPlayerId)
            }));
            return clean.map(t =>
                t.id === teamId ? { ...t, playerIds: [...t.playerIds, selectedPlayerId] } : t
            );
        });
        setSelectedPlayerId(null);
    };

    const handleRemoveFromTeam = (pid: string) => {
        setTeams(prev =>
            prev.map(t => ({
                ...t,
                playerIds: t.playerIds.filter(id => id !== pid)
            }))
        );
    };

    const assignedPlayerIds = new Set(teams.flatMap(t => t.playerIds));
    const unassignedPlayers = participants.filter(p => !assignedPlayerIds.has(p.id));

    // Helper to get player info
    const getP = (pid: string) => participants.find(p => p.id === pid);

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row justify-between items-center px-4 py-3 bg-white border-b border-gray-100">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                        <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-gray-900">{t('teams.title', 'ניהול קבוצות')}</Text>
                </View>
                <TouchableOpacity onPress={handleSave} disabled={saving} className="p-2">
                    <Text className="text-blue-600 font-bold text-lg">{saving ? "..." : t('teams.save', 'שמור')}</Text>
                </TouchableOpacity>
            </View>
            <View className="flex-1 bg-gray-50">
                <ScrollView className="flex-1 p-4">

                    {/* Bench */}
                    <View className="bg-white p-4 rounded-xl mb-4 shadow-sm border border-gray-100">
                        <View className="flex-row justify-between items-center mb-3">
                            <Text className="font-bold text-gray-700">{t('teams.bench', 'ספסל')} ({unassignedPlayers.length})</Text>
                            <TouchableOpacity onPress={() => setTeams(teams.map(t => ({ ...t, playerIds: [] })))}>
                                <Text className="text-red-500 text-xs">{t('teams.resetAll', 'אפס הכל')}</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row flex-wrap">
                            {unassignedPlayers.length === 0 && (
                                <Text className="text-gray-400 italic text-sm">{t('teams.allAssigned', 'כולם שובצו בקבוצות!')}</Text>
                            )}
                            {unassignedPlayers.map(p => (
                                <TouchableOpacity
                                    key={p.id}
                                    onPress={() => setSelectedPlayerId(selectedPlayerId === p.id ? null : p.id)}
                                    className={`mr-2 mb-2 px-3 py-1 rounded-full border ${selectedPlayerId === p.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                                >
                                    <View className="flex-row items-center">
                                        {/* <Image source={{ uri: p.avatar }} className="w-4 h-4 rounded-full mr-1 bg-gray-200" /> */}
                                        <Text className={selectedPlayerId === p.id ? 'text-white' : 'text-gray-700'}>
                                            {p.name?.split(' ')[0]}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {selectedPlayerId && (
                            <Text className="mt-2 text-center text-blue-600 text-sm font-bold">
                                {t('teams.tapToAssign', 'לחץ על קבוצה כדי לשבץ את')} {getP(selectedPlayerId)?.name?.split(' ')[0]}
                            </Text>
                        )}
                    </View>

                    {/* Teams */}
                    <View className="pb-10">
                        {teams.map(team => {
                            const isTarget = !!selectedPlayerId;
                            return (
                                <TouchableOpacity
                                    key={team.id}
                                    activeOpacity={isTarget ? 0.7 : 1}
                                    onPress={() => isTarget && handleAssignToTeam(team.id)}
                                    className={`bg-white rounded-xl mb-4 shadow-sm overflow-hidden border-2 ${isTarget ? 'border-dashed' : 'border-transparent'}`}
                                    style={{ borderColor: isTarget ? team.color : 'transparent' }}
                                >
                                    <View className="p-3 flex-row justify-between items-center" style={{ backgroundColor: team.color }}>
                                        <Text className="text-white font-bold text-lg">{team.name}</Text>
                                        <View className="flex-row items-center">
                                            <View className="bg-white/20 px-2 rounded ml-2">
                                                <Text className="text-white font-bold">{team.playerIds.length}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => handleRemoveTeam(team.id)} className="ml-3">
                                                <FontAwesome name="trash-o" size={18} color="white" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    <View className="p-3 flex-row flex-wrap">
                                        {team.playerIds.length === 0 ? (
                                            <Text className="text-gray-400 italic w-full text-center py-2">{t('teams.emptySquad', 'קבוצה ריקה')}</Text>
                                        ) : (
                                            team.playerIds.map(pid => {
                                                const p = getP(pid);
                                                if (!p) return null;
                                                return (
                                                    <TouchableOpacity
                                                        key={pid}
                                                        onPress={() => {
                                                            setSelectedPlayerId(pid); // Select to move
                                                        }}
                                                        className={`w-[48%] mb-2 mr-[2%] flex-row items-center p-2 rounded-lg ${selectedPlayerId === pid ? 'bg-blue-100' : 'bg-gray-50'}`}
                                                    >
                                                        <Image source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-6 h-6 rounded-full mr-2 bg-gray-200" />
                                                        <Text numberOfLines={1} className="flex-1 text-sm font-medium text-gray-800">{p.name?.split(' ')[0]}</Text>
                                                        {selectedPlayerId === pid && (
                                                            <TouchableOpacity onPress={() => handleRemoveFromTeam(pid)}>
                                                                <FontAwesome name="times" size={14} color="#ef4444" />
                                                            </TouchableOpacity>
                                                        )}
                                                    </TouchableOpacity>
                                                )
                                            })
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}

                        <TouchableOpacity
                            onPress={handleAddTeam}
                            className="bg-white border-2 border-dashed border-gray-300 p-4 rounded-xl items-center"
                        >
                            <FontAwesome name="plus" size={20} color="#9ca3af" />
                            <Text className="text-gray-500 font-bold mt-1">{t('teams.addTeam', 'הוסף קבוצה נוספת')}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Manage Admins Section */}
                    {isOrganizer && (
                        <View className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-2 mb-10">
                            <Text className="font-bold text-gray-700 mb-3">{t('teams.manageAdmins', 'ניהול מנהלים (Admins)')}</Text>
                            <Text className="text-gray-500 text-xs mb-3">{t('teams.adminsDesc', 'מנהלים יכולים לערוך את פרטי המשחק ואת הרכבי הקבוצות')}</Text>
                            
                            {participants.filter(p => p.id !== user.id).map(p => {
                                const isManager = managers.some(m => m.id === p.id);
                                return (
                                    <View key={p.id} className="flex-row items-center justify-between py-2 border-b border-gray-50">
                                        <View className="flex-row items-center">
                                            <Image source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-8 h-8 rounded-full mr-2 bg-gray-200" />
                                            <Text className="text-gray-800 font-medium">{p.name}</Text>
                                        </View>
                                        <TouchableOpacity 
                                            onPress={() => handleToggleManager(p.id, isManager)}
                                            className={`px-3 py-1 rounded-full ${isManager ? 'bg-red-100' : 'bg-blue-100'}`}
                                        >
                                            <Text className={isManager ? 'text-red-600 text-xs font-bold' : 'text-blue-600 text-xs font-bold'}>
                                                {isManager ? t('teams.removeAdmin', 'הסר מנהל') : t('teams.makeAdmin', 'מנה משחק')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                            {participants.length <= 1 && (
                                <Text className="text-gray-400 italic text-sm">{t('teams.noOtherPlayers', 'אין שחקנים נוספים במשחק')}</Text>
                            )}
                        </View>
                    )}

                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

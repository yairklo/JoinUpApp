import { Stack } from 'expo-router';
import { PRIVACY } from '@joinup/shared/legal';
import LegalDocumentView from '@/components/legal/LegalDocumentView';

export default function PrivacyPolicyScreen() {
    return (
        <>
            <Stack.Screen options={{ title: PRIVACY.title, headerShown: true }} />
            <LegalDocumentView doc={PRIVACY} />
        </>
    );
}

import { useRouter as useExpoRouter } from 'expo-router';

export function useRouter() {
    const router = useExpoRouter();

    return {
        push: (href: string) => router.push(href),
        replace: (href: string) => router.replace(href),
        back: () => router.back(),
        refresh: () => {
            // router.refresh() might not be fully equivalent to Next.js data refresh but serves a similar purpose
            // For strict data refetching, React Query is better.
        },
        // Add other methods if needed
    };
}

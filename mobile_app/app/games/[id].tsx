import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Universal/App Link target: https://<web>/games/<id> arrives here as /games/<id>.
 * The game screen lives at /game/<id>; the signed-out case is handled by AuthGuard, which parks this
 * path and restores it after sign-in.
 */
export default function GameLinkRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/game/[id]', params: { id: String(id) } }} />;
}

import { Redirect } from 'expo-router';

/**
 * Redirects the default tabs index route to the lobbies screen.
 */
export default function Index() {
  return <Redirect href="/lobbies" />;
}

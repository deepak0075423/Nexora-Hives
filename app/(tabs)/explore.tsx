import { Redirect } from 'expo-router';

// This default expo tab is replaced by the Nexora tab navigation.
// Redirect to home if somehow reached.
export default function Explore() {
  return <Redirect href="/(tabs)" />;
}

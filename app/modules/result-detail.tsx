/**
 * The old single-result screen (Oct 2026: retired). It read
 * `/student/results/:id` shapes the server no longer sends, and nothing in the
 * app links to it any more — every result is a scorecard on the Results
 * screen, with every subject, the class's figures and the re-exam. An old
 * notification or bookmark that still names this screen lands there instead.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ResultDetailScreen() {
  const { child } = useLocalSearchParams<{ child?: string }>();
  return <Redirect href={{ pathname: '/modules/results', params: child ? { child } : {} } as any} />;
}

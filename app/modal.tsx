import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

export default function ModalScreen() {
  const router = useRouter();
  return (
    <View style={s.root}>
      <Text style={s.title}>Modal</Text>
      <TouchableOpacity onPress={() => router.dismiss()}>
        <Text style={s.close}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title: { ...Typography.h3, color: Colors.text, marginBottom: 16 },
  close: { ...Typography.label, color: Colors.accent },
});

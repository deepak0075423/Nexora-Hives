import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { verifyPin } from '@/utils/appLock';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function LockScreen({ onUnlock, onForgot, subtitle }: {
  onUnlock: () => void;
  onForgot?: () => void;
  subtitle?: string;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;
    (async () => {
      if (await verifyPin(pin)) {
        setPin('');
        onUnlock();
      } else {
        setError(true);
        Vibration.vibrate(150);
        setTimeout(() => { setPin(''); setError(false); }, 600);
      }
    })();
  }, [pin]);

  const press = (k: string) => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (!k || pin.length >= 4) return;
    setPin(p => p + k);
  };

  return (
    <View style={s.root}>
      <View style={s.iconBox}>
        <Ionicons name="lock-closed" size={30} color="#fff" />
      </View>
      <Text style={s.title}>Enter PIN</Text>
      <Text style={s.sub}>{subtitle ?? 'Unlock Aksharum'}</Text>

      <View style={s.dots}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[
            s.dot,
            pin.length > i && s.dotFilled,
            error && s.dotError,
          ]} />
        ))}
      </View>
      {error && <Text style={s.errorText}>Wrong PIN — try again</Text>}

      <View style={s.pad}>
        {KEYS.map((k, i) => (
          <TouchableOpacity
            key={i}
            style={[s.key, !k && { opacity: 0 }]}
            onPress={() => press(k)}
            disabled={!k}
            activeOpacity={0.6}
          >
            <Text style={s.keyText}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {onForgot && (
        <TouchableOpacity onPress={onForgot} style={{ marginTop: Spacing.lg }}>
          <Text style={s.forgot}>Forgot PIN? Sign out of all accounts</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  iconBox: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  title: { ...Typography.h2, color: '#fff' },
  sub: { ...Typography.body, color: 'rgba(255,255,255,0.6)', marginTop: 4, marginBottom: Spacing.lg },
  dots: { flexDirection: 'row', gap: 16, marginBottom: Spacing.md },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  dotFilled: { backgroundColor: '#fff', borderColor: '#fff' },
  dotError: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  errorText: { fontSize: 12, color: '#FCA5A5', marginBottom: 4 },
  pad: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    width: 280, marginTop: Spacing.md,
  },
  key: {
    width: 72, height: 72, borderRadius: 36, margin: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 26, fontWeight: '600', color: '#fff' },
  forgot: { fontSize: 12, color: 'rgba(255,255,255,0.55)', textDecorationLine: 'underline' },
});

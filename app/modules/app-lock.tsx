import React, { useEffect, useState } from 'react';
import { ScrollView, Text, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  hasPin, setPin, verifyPin, isAppLockOn, setAppLock,
  isAccountLockOn, setAccountLock, clearPinAndLocks,
} from '@/utils/appLock';
import { Input, Toggle, ActionBtn, SectionTitle, Card, KV, confirmAsync } from '@/components/ui/kit';

export default function AppLockScreen() {
  const { user } = useAuth();
  const [pinSet, setPinSet] = useState(false);
  const [appLock, setAppLockState] = useState(false);
  const [accLock, setAccLockState] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setPinSet(await hasPin());
    setAppLockState(await isAppLockOn());
    if (user?._id) setAccLockState(await isAccountLockOn(user._id));
  };
  useEffect(() => { load(); }, [user?._id]);

  const savePin = async () => {
    if (!/^\d{4}$/.test(newPin)) return Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
    if (newPin !== confirmPin) return Alert.alert('Mismatch', 'The two PINs do not match.');
    if (pinSet && !(await verifyPin(currentPin)))
      return Alert.alert('Wrong PIN', 'Your current PIN is incorrect.');
    setSaving(true);
    try {
      await setPin(newPin);
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
      await load();
      Alert.alert('Saved', pinSet ? 'PIN changed.' : 'PIN set. You can now enable the locks below.');
    } finally { setSaving(false); }
  };

  const toggleApp = async (on: boolean) => {
    if (on && !pinSet) return Alert.alert('Set a PIN first', 'Create a 4-digit PIN above before enabling the lock.');
    await setAppLock(on);
    setAppLockState(on);
  };

  const toggleAccount = async (on: boolean) => {
    if (!user?._id) return;
    if (on && !pinSet) return Alert.alert('Set a PIN first', 'Create a 4-digit PIN above before enabling the lock.');
    await setAccountLock(user._id, on);
    setAccLockState(on);
  };

  const disableAll = async () => {
    if (!(await confirmAsync('Remove PIN', 'This removes the PIN and turns off all locks. Continue?', 'Remove'))) return;
    await clearPinAndLocks();
    if (user?._id) await setAccountLock(user._id, false);
    setCurrentPin(''); setNewPin(''); setConfirmPin('');
    load();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'App Lock' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <KV label="Status" value={pinSet ? 'PIN is set' : 'No PIN yet'} />
        </Card>

        <SectionTitle>{pinSet ? 'Change PIN' : 'Set a 4-digit PIN'}</SectionTitle>
        {pinSet && (
          <Input label="Current PIN" value={currentPin} onChange={setCurrentPin} keyboardType="numeric" secure placeholder="••••" />
        )}
        <Input label="New PIN" value={newPin} onChange={setNewPin} keyboardType="numeric" secure placeholder="4 digits" />
        <Input label="Confirm New PIN" value={confirmPin} onChange={setConfirmPin} keyboardType="numeric" secure placeholder="4 digits" />
        <ActionBtn label={saving ? 'Saving…' : pinSet ? 'Change PIN' : 'Set PIN'} tone="success" onPress={savePin} />

        <SectionTitle>Locks</SectionTitle>
        <Toggle
          label="Lock the whole app"
          sub="PIN is asked every time the app opens, whoever is signed in"
          value={appLock} onChange={toggleApp}
        />
        <Toggle
          label={`Lock this account (${user?.name ?? ''})`}
          sub="PIN is asked when opening the app as, or switching to, this account"
          value={accLock} onChange={toggleAccount}
        />

        {pinSet && (
          <>
            <SectionTitle>Danger zone</SectionTitle>
            <ActionBtn label="Remove PIN & disable locks" tone="danger" onPress={disableAll} />
          </>
        )}

        <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 14, lineHeight: 16 }}>
          The lock also re-engages when the app has been in the background for more than 30 seconds.
          If you forget the PIN, the lock screen lets you sign out of all accounts and start over.
        </Text>
      </ScrollView>
    </>
  );
}

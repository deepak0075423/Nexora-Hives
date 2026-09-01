import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { BASE_URL } from '@/api/axios';

/**
 * The paperwork already on a record, shown inside a document picker.
 *
 * An edit form that only says "a file is on record" is asking the admin to take
 * its word for it — they cannot tell a correct scan from one uploaded to the
 * wrong slot without saving and going to look. Scans are images far more often
 * than not, so an image is shown as a thumbnail and everything else as a row
 * that opens the file; tapping either opens the full document in the browser.
 */

// Uploads are served from the backend ROOT, while BASE_URL points at /api.
const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

/** `folder` is the uploads sub-directory the form's paperwork lives in. */
export function docUrl(folder: string, file?: string) {
  return file ? `${UPLOADS_ORIGIN}/uploads/${folder}/${file}` : '';
}

export default function ExistingDoc({ folder, file, replaceHint = 'tap the button above to replace it' }: {
  folder: string; file?: string; replaceHint?: string;
}) {
  // A record can outlive its file. A broken thumbnail is worse than the plain
  // row the non-image branch already shows, so fall back to it.
  const [broken, setBroken] = useState(false);
  if (!file) return null;

  const url = docUrl(folder, file);
  const isImage = IMAGE_RE.test(file) && !broken;

  const open = () => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open', 'This document could not be opened on this device.'));
  };

  return (
    <TouchableOpacity style={s.row} onPress={open} accessibilityRole="button">
      {isImage ? (
        <Image source={{ uri: url }} style={s.thumb} onError={() => setBroken(true)} />
      ) : (
        <View style={[s.thumb, s.thumbIcon]}>
          <Ionicons name="document-text-outline" size={20} color={Colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.title}>On file — tap to view</Text>
        <Text style={s.sub} numberOfLines={1}>{replaceHint}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={Colors.accent} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.sm, backgroundColor: Colors.surfaceAlt,
  },
  thumb: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 12, fontWeight: '600', color: Colors.text },
  sub:   { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
});

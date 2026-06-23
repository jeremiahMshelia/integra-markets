import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { restoreAccount } from '@/services/accountService';

const colors = {
  bg: '#3A1F1F',
  border: '#5A2F2F',
  text: '#FFD7D7',
  accent: '#FF6B6B',
  buttonBg: '#4ECCA3',
  buttonText: '#121212',
};

type Props = {
  expiresAt: string;
  onRestored: () => void;
};

/**
 * Top-of-screen banner shown whenever the signed-in user has a pending
 * account deletion. Tells them when their data will be removed and lets
 * them cancel with one tap.
 *
 * Parent supplies the expires_at and is notified on successful restore
 * so it can refresh its pending-deletion state.
 */
export function PendingDeletionBanner({ expiresAt, onRestored }: Props) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);

    const result = await restoreAccount();
    setRestoring(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onRestored();
  };

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>Account scheduled for deletion</Text>
        <Text style={styles.body}>
          Your account and all data will be removed on{' '}
          {formatDate(expiresAt)}. Restore anytime before then.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={handleRestore}
        disabled={restoring}
      >
        {restoring ? (
          <ActivityIndicator color={colors.buttonText} />
        ) : (
          <Text style={styles.buttonText}>Restore</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  textBlock: { flex: 1 },
  title: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  body: { color: colors.text, fontSize: 12, marginTop: 2 },
  error: { color: colors.accent, fontSize: 11, marginTop: 4 },
  button: {
    backgroundColor: colors.buttonBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 84,
    alignItems: 'center',
  },
  buttonText: { color: colors.buttonText, fontWeight: '700', fontSize: 13 },
});

export default PendingDeletionBanner;

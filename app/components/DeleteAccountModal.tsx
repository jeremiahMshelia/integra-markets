import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { requestAccountDeletion } from '@/services/accountService';

const CONFIRM_PHRASE = 'DELETE';

const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  bgTertiary: '#2A2A2A',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  textMuted: '#6B6B6B',
  accentNegative: '#FF6B6B',
  accentPositive: '#4ECCA3',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onDeleted: (expiresAt: string) => void;
};

/**
 * Two-step delete confirmation:
 *  1. User reads the cooldown warning.
 *  2. User types DELETE to enable the destructive button.
 *
 * On success, the parent is notified with the expires_at timestamp so it
 * can switch the user-facing UI to the pending-deletion / restore banner.
 */
export function DeleteAccountModal({ visible, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = typed.trim().toUpperCase() === CONFIRM_PHRASE && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    const result = await requestAccountDeletion();
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTyped('');
    onDeleted(result.data.expires_at);
  };

  const handleClose = () => {
    if (submitting) return;
    setTyped('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete account?</Text>

          <Text style={styles.body}>
            Your account will be scheduled for permanent deletion. You have a
            <Text style={styles.bodyEmphasis}> 30-day cooldown</Text> — sign in
            anytime during that window to restore your account.
          </Text>

          <Text style={styles.body}>
            After 30 days, your account and all associated data are removed
            and cannot be recovered.
          </Text>

          <Text style={styles.label}>
            Type <Text style={styles.labelEmphasis}>{CONFIRM_PHRASE}</Text> to confirm:
          </Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting}
            placeholder={CONFIRM_PHRASE}
            placeholderTextColor={colors.textMuted}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteButton, !canSubmit && styles.deleteDisabled]}
              onPress={handleConfirm}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.deleteText}>Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.bgTertiary,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  bodyEmphasis: { color: colors.textPrimary, fontWeight: '600' },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
    marginBottom: 8,
  },
  labelEmphasis: { color: colors.accentNegative, fontWeight: '700' },
  input: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.bgTertiary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Courier',
  },
  error: {
    color: colors.accentNegative,
    fontSize: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.bgTertiary,
  },
  cancelText: { color: colors.textSecondary, fontWeight: '500' },
  deleteButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accentNegative,
    minWidth: 90,
    alignItems: 'center',
  },
  deleteDisabled: { opacity: 0.4 },
  deleteText: { color: colors.textPrimary, fontWeight: '600' },
});

export default DeleteAccountModal;

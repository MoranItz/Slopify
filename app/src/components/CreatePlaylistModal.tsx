import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

export default function CreatePlaylistModal({
  visible,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      setName("");
      onClose();
    } catch (e) {
      setError("Failed to create playlist: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>New Playlist</Text>
          <Text style={styles.sub}>Enter a name for your playlist</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Midnight Cyberpunk"
            placeholderTextColor={colors.textSecondary}
            autoFocus
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, styles.cancelBtn]}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleCreate}
              style={[
                styles.btn,
                styles.createBtn,
                !name.trim() && styles.disabledBtn,
              ]}
              disabled={loading || !name.trim()}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.createText}>Create</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dialog: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.secondaryAccent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: "#ff5555",
    fontSize: 12,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    minWidth: 84,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: colors.card,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  createBtn: {
    backgroundColor: colors.accent,
  },
  createText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.45,
  },
});

/**
 * Reusable profile UI primitives and style tokens shared across profile screens.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

export const profilePalette = {
  page: '#CC0033',
  card: '#FFFFFF',
  softCard: '#FFF3F7',
  border: '#F1CCD8',
  accent: '#CC0033',
  accentDark: '#AA0029',
  text: '#3B1F28',
  muted: '#7A5A65',
  chipBg: '#FFE3EB',
  eloNoteBg: '#FFF0F4',
} as const;

export function InfoRow({
  label,
  value,
  icon,
  styles,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  styles: {
    infoRow: StyleProp<ViewStyle>;
    infoIconWrap: StyleProp<ViewStyle>;
    infoTextWrap: StyleProp<ViewStyle>;
    infoLabel: StyleProp<TextStyle>;
    infoValue: StyleProp<TextStyle>;
  };
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <MaterialIcons name={icon} size={18} color={profilePalette.accent} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}


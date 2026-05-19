/**
 * App sidebar menu for profile, help, and account navigation actions.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { API_BASE_URL, getAccessToken } from '@/api/backend';
import { supabase } from '@/api/supabase';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type UserMe = {
  user_id: string;
  username: string;
};


type SidebarProps = {
  onClose?: () => void;
};

export function Sidebar({ onClose }: SidebarProps) {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);

  const colors = Colors[colorScheme ?? 'light'];

  const navigateAndClose = (path: string) => {
    onClose?.();
    router.push(path as '/contact-us' | '/user-guide' | '/view-profile');
  };

  const performSignOut = async () => {
    onClose?.();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure? Do you want to sign out?')) {
        performSignOut();
      }
    } else {
      Alert.alert(
        'Are you sure?',
        'Do you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign out',
            style: 'destructive',
            onPress: performSignOut,
          },
        ],
      );
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as UserMe;
          setUser(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
      <View style={[styles.sidebar, { backgroundColor: colors.background }]}>
      <View style={styles.profileSection}>
        {/* Default profile picture - tappable */}
        <Pressable
          style={({ pressed }) => [styles.profileTouchable, pressed && styles.profileTouchablePressed]}
          onPress={() => navigateAndClose('/view-profile')}
        >
          <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
            <MaterialIcons name="person" size={40} color="#fff" />
          </View>
        </Pressable>
        {loading ? (
          <ActivityIndicator size="small" color={colors.tint} style={styles.loader} />
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.usernameTouchable, pressed && styles.profileTouchablePressed]}
              onPress={() => navigateAndClose('/view-profile')}
            >
              <ThemedText type="defaultSemiBold" style={styles.username}>
                {user?.username ?? 'Player'}
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.links}>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={() => navigateAndClose('/contact-us')}
        >
          <ThemedText type="link">Contact Us</ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={() => navigateAndClose('/view-profile')}
        >
          <ThemedText type="link">View profile</ThemedText>
        </Pressable>  
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={() => navigateAndClose('/user-guide')}
        >
          <ThemedText type="link">User Guide</ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={handleSignOut}
        >
          <ThemedText type="link">Sign out</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    flex: 1,
    width: '100%',
    maxWidth: 320,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.08)',
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileTouchable: {
    alignSelf: 'center',
  },
  profileTouchablePressed: {
    opacity: 0.7,
  },
  usernameTouchable: {
    alignSelf: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loader: {
    marginVertical: 4,
  },
  username: {
    textAlign: 'center',
    marginBottom: 4,
  },
  links: {
    gap: 8,
  },
  link: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  linkPressed: {
    opacity: 0.7,
  },
});

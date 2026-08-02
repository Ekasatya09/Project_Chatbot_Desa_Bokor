import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Colors } from '@/theme';

interface NavbarProps {
  adminName: string;
  onLogout: () => void;
}

const NAV_LINKS = [
  { label: 'Dashboard', href: '/(tabs)' },
  { label: 'Layanan', href: '/(tabs)/layanan' },
  { label: 'Riwayat', href: '/(tabs)/riwayat' },
  { label: 'Statistik', href: '/(tabs)/statistik' },
];

export function Navbar({ adminName, onLogout }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/(tabs)') return pathname === '/' || pathname === '/(tabs)' || pathname === '';
    return pathname.startsWith(href.replace('/(tabs)', ''));
  }

  return (
    <View style={styles.wrapper}>
      {/* Top bar: brand + user */}
      <View style={styles.topBar}>
        <Text style={styles.brandText}>🏛️ Dashboard Chatbot Desa</Text>
        <View style={styles.user}>
          <Text style={styles.userName}>{adminName}</Text>
          <Button title="Logout" variant="danger" size="sm" onPress={onLogout} />
        </View>
      </View>

      {/* Nav links */}
      <View style={styles.navLinks}>
        {NAV_LINKS.map((link) => {
          const active = isActive(link.href);
          return (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href as any)}
              style={({ pressed }) => [
                styles.navLink,
                active && styles.navLinkActive,
                pressed && !active && styles.navLinkPressed,
              ]}
            >
              <Text style={[styles.navLinkText, active && styles.navLinkTextActive]}>
                {link.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    zIndex: 100,
  },
  topBar: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  brandText: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userName: { color: Colors.textMuted, fontSize: 14 },
  navLinks: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 4,
  },
  navLink: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  navLinkActive: {
    borderBottomColor: Colors.primary,
  },
  navLinkPressed: {
    backgroundColor: Colors.bg,
    borderRadius: 6,
  },
  navLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  navLinkTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
});

import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { LiveChatNotif } from '@/components/LiveChatNotif';
import { Colors } from '@/theme';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <LiveChatNotif />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarStyle: { display: 'none' },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="layanan" options={{ title: 'Layanan' }} />
        <Tabs.Screen name="riwayat" options={{ title: 'Riwayat' }} />
        <Tabs.Screen name="statistik" options={{ title: 'Statistik' }} />
      </Tabs>
    </View>
  );
}

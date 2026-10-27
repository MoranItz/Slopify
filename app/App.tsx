import React, { useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import {
  createBottomTabNavigator,
  BottomTabBar,
} from "@react-navigation/bottom-tabs";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { PlayerProvider } from "./src/player/PlayerProvider";
import MiniPlayer from "./src/components/MiniPlayer";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import PlaylistsScreen from "./src/screens/PlaylistsScreen";
import PlayerScreen from "./src/screens/PlayerScreen";
import { colors } from "./src/theme";

const Tab = createBottomTabNavigator();

// Custom navigation theme so background behind navigation elements is dark
const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    text: colors.text,
  },
};

function MainNavigator() {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          sceneStyle: { backgroundColor: colors.bg },
          headerStyle: {
            backgroundColor: colors.bg,
            borderBottomColor: colors.border,
            borderBottomWidth: 1,
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTitleStyle: {
            color: colors.text,
            fontWeight: "700",
            letterSpacing: 0.5,
          },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 56 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 6),
            paddingTop: 6,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
        }}
        tabBar={(props) => (
          <View style={{ backgroundColor: colors.bg }}>
            {!isPlayerOpen && (
              <MiniPlayer onPress={() => setIsPlayerOpen(true)} />
            )}
            <BottomTabBar {...props} />
          </View>
        )}
      >
        <Tab.Screen
          name="Discover"
          component={DiscoverScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="sparkles" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Library"
          component={LibraryScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="library" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Playlists"
          component={PlaylistsScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="disc" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>

      <Modal
        visible={isPlayerOpen}
        animationType="none"
        transparent={true}
        onRequestClose={() => setIsPlayerOpen(false)}
      >
        <PlayerScreen onClose={() => setIsPlayerOpen(false)} />
      </Modal>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <NavigationContainer theme={NavTheme}>
          <StatusBar style="light" />
          <MainNavigator />
        </NavigationContainer>
      </PlayerProvider>
    </SafeAreaProvider>
  );
}

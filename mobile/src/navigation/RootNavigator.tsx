import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useNetworkDashboard } from '../api/networkStore';
import { Icon, IconName } from '../components/Icon';
import { colors } from '../theme';
import { LoginScreen } from '../screens/LoginScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { UnionHomeScreen } from '../screens/UnionHomeScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { ClientRfaScreen } from '../screens/ClientRfaScreen';
import { RankDetailScreen } from '../screens/RankDetailScreen';
import { FilteredClientsScreen } from '../screens/FilteredClientsScreen';
import { AnalysesScreen } from '../screens/AnalysesScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { AdherentHomeScreen } from '../screens/AdherentHomeScreen';
import { AdherentRfaScreen } from '../screens/AdherentRfaScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    primary: colors.orange,
    card: colors.bgElevated,
    text: colors.white,
    border: colors.cardBorder,
    notification: colors.orange,
  },
};

function useTabScreenOptions() {
  const insets = useSafeAreaInsets();
  // Pixel / Android 3-button nav : laisser de la place sous la tab bar
  const bottomPad = Math.max(insets.bottom, 10);
  return {
    headerStyle: { backgroundColor: colors.bgElevated },
    headerTintColor: colors.white,
    headerShadowVisible: false,
    tabBarStyle: {
      backgroundColor: colors.bgElevated,
      borderTopColor: colors.cardBorder,
      height: 54 + bottomPad,
      paddingTop: 6,
      paddingBottom: bottomPad,
    },
    tabBarActiveTintColor: colors.orange,
    tabBarInactiveTintColor: colors.muted2,
    tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' as const },
    tabBarBadgeStyle: { backgroundColor: colors.red, fontSize: 10, color: colors.white },
  } as const;
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Icon name={focused ? active : inactive} size={22} color={color} />
  );
}

function UnionTabs() {
  const { dash } = useNetworkDashboard();
  const nCrit = dash?.alertes?.n_crit || 0;
  const screenOptions = useTabScreenOptions();

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Accueil"
        component={UnionHomeScreen}
        options={{
          title: 'Union',
          tabBarLabel: 'Accueil',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tab.Screen
        name="Adherents"
        component={ClientsScreen}
        options={{
          title: 'Adhérents',
          tabBarLabel: 'Adhérents',
          tabBarIcon: tabIcon('people', 'people-outline'),
        }}
      />
      <Tab.Screen
        name="Analyses"
        component={AnalysesScreen}
        options={{
          title: 'Analyses',
          tabBarLabel: 'Analyses',
          tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline'),
        }}
      />
      <Tab.Screen
        name="Alertes"
        component={AlertsScreen}
        options={{
          title: 'Alertes',
          tabBarLabel: 'Alertes',
          tabBarBadge: nCrit ? nCrit : undefined,
          tabBarIcon: tabIcon('notifications', 'notifications-outline'),
        }}
      />
      <Tab.Screen
        name="Compte"
        component={AccountScreen}
        options={{
          tabBarLabel: 'Compte',
          tabBarIcon: tabIcon('person-circle', 'person-circle-outline'),
        }}
      />
    </Tab.Navigator>
  );
}

function AdherentTabs() {
  const screenOptions = useTabScreenOptions();

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Accueil"
        component={AdherentHomeScreen}
        options={{
          title: 'Mon espace',
          tabBarLabel: 'Accueil',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tab.Screen
        name="RFA"
        component={AdherentRfaScreen}
        options={{
          title: 'Ma RFA',
          tabBarLabel: 'Ma RFA',
          tabBarIcon: tabIcon('cash', 'cash-outline'),
        }}
      />
      <Tab.Screen
        name="Compte"
        component={AccountScreen}
        options={{
          tabBarLabel: 'Compte',
          tabBarIcon: tabIcon('person-circle', 'person-circle-outline'),
        }}
      />
    </Tab.Navigator>
  );
}

const detailScreenOptions = {
  headerStyle: { backgroundColor: colors.bgElevated },
  headerTintColor: colors.white,
  headerShadowVisible: false,
};

function UnionStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="UnionTabs" component={UnionTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="ClientRfa"
        component={ClientRfaScreen}
        options={{ title: 'Fiche', ...detailScreenOptions }}
      />
      <Stack.Screen
        name="RankDetail"
        component={RankDetailScreen}
        options={({ route }: any) => ({
          title: route?.params?.title || 'Classement',
          ...detailScreenOptions,
        })}
      />
      <Stack.Screen
        name="FilteredClients"
        component={FilteredClientsScreen}
        options={({ route }: any) => ({
          title: route?.params?.title || 'Clients',
          ...detailScreenOptions,
        })}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading, isUnion, isAdherent } = useAuth();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <NavigationContainer theme={navTheme}>
      {isUnion || (!isAdherent && String(user.role || '').toUpperCase() === 'ADMIN') ? (
        <UnionStack />
      ) : (
        <AdherentTabs />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});

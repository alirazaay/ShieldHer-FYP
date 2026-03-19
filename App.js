import Home from './src/screens/Home';
import Login from './src/screens/Login';
import SignUp from './src/screens/SignUp';
import Dashboard from './src/screens/Dashboard';
import GuardianDashboard from './src/screens/GuardianDashboard';
import LogoutPopup from './src/screens/LogoutPopup';
import ForgotPass from './src/screens/ForgotPass';
import ProfileScreen from './src/screens/ProfileScreen';
import ChangePassword from './src/screens/ChangePassword';
import NotificationSettings from './src/screens/NotificationSettings';
import LocationSettings from './src/screens/LocationSettings';
import UserLocationMapScreen from './src/screens/UserLocationMapScreen';
import GroupLocationMapScreen from './src/screens/GroupLocationMapScreen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';
import { getApps } from 'firebase/app';
import './src/config/firebase';
import { useEffect } from 'react';
import { checkFirebaseConnection } from './src/utils/checkFirebaseConnection'; // 👈 import here

enableScreens();

export default function App() {
  const Stack = createNativeStackNavigator();

  useEffect(() => {
    // 👇 This will run when app starts and show connection logs
    checkFirebaseConnection();
  }, []);

  try {
    console.log('Firebase apps loaded:', getApps().map(a => a.name));
  } catch (e) {
    console.warn('Unable to read Firebase apps:', e);
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="SignUp" component={SignUp} />
        <Stack.Screen name="ForgotPass" component={ForgotPass} />
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="GuardianDashboard" component={GuardianDashboard} />
        <Stack.Screen name="LogoutPopup" component={LogoutPopup} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePassword} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
        <Stack.Screen name="LocationSettings" component={LocationSettings} />
        <Stack.Screen name="UserLocationMap" component={UserLocationMapScreen} />
        <Stack.Screen name="GroupLocationMap" component={GroupLocationMapScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import {Platform} from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
let pending:Promise<unknown>=Promise.resolve();
function exclusive<T>(work:()=>Promise<T>){const result=pending.catch(()=>{}).then(work);pending=result;return result;}
async function register(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });


  return token;
}

export const registerDevicePush=()=>exclusive(register);
export async function unregisterDevicePush(){
 let timer:ReturnType<typeof setTimeout>|undefined;const operation=exclusive(()=>Notifications.unregisterForNotificationsAsync());
 try{await Promise.race([operation,new Promise<void>(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}
}

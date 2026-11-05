import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import {useRouter,type Href} from 'expo-router';
import {notificationPath} from '@/lib/notification-links';
import {registerDevicePush} from '@/lib/device-push';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner:true,
    shouldShowList:true,
  }),
});

export function usePushNotifications(){
 const {token:authToken,user}=useAuthStore(),actor=user?.id,router=useRouter(),handled=useRef(new Set<string>());
 useEffect(()=>{
  if(!authToken||!actor)return;
  let active=true;const current=()=>active&&useAuthStore.getState().token===authToken&&useAuthStore.getState().user?.id===actor;
  void registerDevicePush().then(async token=>{
   if(!token||!current())return;
   const receipt=await api.post<{ok:boolean;actorId:string}>('/api/users/push-token',{token,platform:Platform.OS});
   if(current()&&(receipt.ok!==true||receipt.actorId!==actor))throw new Error('Invalid push receipt');
  }).catch(()=>{});
  const open=(response:Notifications.NotificationResponse|null)=>{
   if(!response||!current())return;
   const id=response.notification.request.identifier,data=response.notification.request.content.data;
   if(handled.current.has(id)||data?.recipientId!==actor)return;
   const path=notificationPath(data?.url);if(!path)return;
   handled.current.add(id);if(handled.current.size>100)handled.current.delete(handled.current.values().next().value!);
   router.push(path as Href);void Notifications.clearLastNotificationResponseAsync().catch(()=>{});
  };
  const received=Notifications.addNotificationReceivedListener(()=>{});
  const response=Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(open).catch(()=>{});
  return()=>{active=false;received.remove();response.remove();};
 },[authToken,actor,router]);
}

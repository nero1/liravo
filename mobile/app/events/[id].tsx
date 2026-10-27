import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, ScrollView, Alert, ActivityIndicator,Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';
import { useTranslations } from '@/hooks/useTranslations';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const {t,locale}=useTranslations('events');
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['event', id], queryFn: () => api.get<{ event: any }>(ENDPOINTS.events.byId(id!)), enabled: !!id });
  const reload=()=>{void qc.invalidateQueries({queryKey:['event',id]});};
  const rsvp = useMutation({ mutationFn: () => api.post(ENDPOINTS.events.rsvp(id!)), onSuccess: () => {reload();Alert.alert(t('rsvpConfirmed'));}, onError: () => Alert.alert(t('error'),t('checkoutUnavailable')) });
  const checkout=useMutation({mutationFn:async()=>{
    const result=await api.post<{redirectUrl:string;statusUrl:string}>(`/api/events/${id}/ticket`);
    if(result.redirectUrl===result.statusUrl)return;
    const target=new URL(result.redirectUrl);
    if(target.protocol!=='https:'||target.username||target.password||target.port||target.hostname!=='checkout.paystack.com'&&!/(^|\.)dodopayments\.com$/.test(target.hostname))throw new Error('Invalid checkout');
    await Linking.openURL(target.href);
  },onSuccess:reload,onError:()=>{reload();Alert.alert(t('error'),t('checkoutUnavailable'));}});
  const verify=useMutation({mutationFn:async()=>{const result=await api.post<{failed:number}>('/api/payments/reconcile');if(result.failed)throw new Error('Verification unavailable');},onSuccess:reload,onError:()=>Alert.alert(t('error'),t('verificationUnavailable'))});
  const event = data?.event;
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading || !event) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Text className="text-2xl font-bold text-foreground">{event.title}</Text>
        {event.description && <Text className="text-foreground">{event.description}</Text>}
        {event.event_date && <Text className="text-sm text-muted-foreground">📅 {new Date(event.event_date).toLocaleString(locale)}</Text>}
        {event.is_paid&&<Text className="text-foreground">{new Intl.NumberFormat(locale,{style:'currency',currency:event.currency}).format(event.price??0)}</Text>}
        {event.ticket&&<Text accessibilityLiveRegion="polite" className="text-foreground">{t(`ticket_${event.ticket.status}`)}</Text>}
        {!event.is_paid?<Button onPress={()=>rsvp.mutate()} loading={rsvp.isPending} disabled={event.has_rsvp||new Date(event.event_date)<=new Date()} size="lg">{event.has_rsvp?t('rsvpConfirmed'):t('rsvpFree')}</Button>:<>
          {event.can_purchase&&(!event.ticket||['pending','expired','refunded'].includes(event.ticket.status))&&<Button onPress={()=>checkout.mutate()} loading={checkout.isPending} disabled={new Date(event.event_date)<=new Date()} size="lg">{event.ticket?.status==='pending'?t('continueCheckout'):t('buyTicket',{price:new Intl.NumberFormat(locale,{style:'currency',currency:event.currency}).format(event.price??0)})}</Button>}
          {event.ticket&&['pending','expired'].includes(event.ticket.status)&&<Button onPress={()=>verify.mutate()} loading={verify.isPending}>{t('checkPayment')}</Button>}
        </>}
        <Button variant="outline" onPress={()=>void refetch()}>{t('refresh')}</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

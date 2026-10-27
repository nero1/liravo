import { Alert, ScrollView,View,Text,Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useTranslations } from '@/hooks/useTranslations';

export default function NewEventScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const {t}=useTranslations('events');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate,setEventDate]=useState('');
  const [paid,setPaid]=useState(false),[price,setPrice]=useState(''),[currency,setCurrency]=useState('USD'),[capacity,setCapacity]=useState('');
  const date=new Date(eventDate);
  const validDate=Number.isFinite(date.getTime())&&date.getTime()>Date.now();
  const create = useMutation({
    mutationFn: () => api.post(ENDPOINTS.events.create, { title, description,event_date:date.toISOString(),is_paid:paid,currency,...(paid?{price:Number(price)}:{}),...(capacity?{max_attendees:Number(capacity)}:{}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); router.back(); },
    onError: () => Alert.alert(t('error'),t('createFailed')),
  });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Input label={t('eventTitle')} value={title} onChangeText={setTitle} maxLength={200} />
        <Input label={t('description')} value={description} onChangeText={setDescription} maxLength={5000} multiline numberOfLines={4} style={{ textAlignVertical: 'top' }} />
        <Input label={t('eventDate')} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DDTHH:MM" />
        <View className="flex-row items-center justify-between"><Text className="text-foreground">{t('paidEvent')}</Text><Switch accessibilityLabel={t('paidEvent')} value={paid} onValueChange={setPaid}/></View>
        {paid&&<><Input label={t('ticketPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad"/><View accessibilityLabel={t('currency')} className="flex-row gap-2">{['USD','NGN','EUR'].map(value=><Button key={value} variant={currency===value?'primary':'outline'} accessibilityState={{selected:currency===value}} onPress={()=>setCurrency(value)}>{value}</Button>)}</View></>}
        <Input label={t('maxAttendees')} value={capacity} onChangeText={setCapacity} keyboardType="number-pad"/>
        <Button onPress={() => create.mutate()} loading={create.isPending} disabled={!title.trim()||!description.trim()||!validDate||paid&&(!Number.isFinite(Number(price))||Number(price)<0.5||Number(price)>5000)||!!capacity&&(!Number.isInteger(Number(capacity))||Number(capacity)<1)} size="lg">{t('createEvent')}</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

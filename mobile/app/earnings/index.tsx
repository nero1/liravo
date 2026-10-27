import {useState,useEffect} from 'react';
import {View,Text,ScrollView,Alert,ActivityIndicator,TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import {Card} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Input} from '@/components/ui/Input';
import {useTranslations} from '@/hooks/useTranslations';
import {useRequestIntent} from '@/hooks/useRequestIntent';

interface Earnings{currency:string;available:string;reserved:string;paid:string;pinRequired:boolean;payouts:{id:string;amount:string;status:string;created_at:string}[];nextCursor:string|null;}
export default function EarningsScreen(){
  const {t,locale}=useTranslations('earnings');
  const userId=useAuthStore(state=>state.user?.id),queryClient=useQueryClient();
  const intent=useRequestIntent(userId);
  const [currency,setCurrency]=useState<'USD'|'NGN'|'EUR'>('USD'),[cursor,setCursor]=useState<string|undefined>(),[method,setMethod]=useState<'manual'|'paystack'>('manual'),[amount,setAmount]=useState('');
  const [name,setName]=useState(''),[account,setAccount]=useState(''),[bank,setBank]=useState(''),[pin,setPin]=useState('');
  useEffect(()=>{setName('');setAccount('');setBank('');setPin('');setAmount('');setCurrency('USD');setMethod('manual');setCursor(undefined);},[userId]);
  const query=useQuery({queryKey:['earnings',userId,currency,cursor],enabled:!!userId,queryFn:()=>api.get<Earnings>(ENDPOINTS.earnings.list,{currency,cursor})});
  const refresh=()=>queryClient.invalidateQueries({queryKey:['earnings',userId]});
  const proof=()=>query.data?.pinRequired?{pin}:{};
  const destination=useMutation({mutationFn:async()=>{const body={provider:method,currency,display_name:name,account_number:account,bank_code:bank,...proof()};return api.put<{saved:boolean}>(ENDPOINTS.earnings.payoutMethod,body,await intent.durableHeaders(body,'destination:'+currency));},onSuccess:async result=>{if(useAuthStore.getState().user?.id!==userId)return;if(result.saved){await intent.complete('destination:'+currency);setPin('');}Alert.alert(t(result.saved?'saved':'failed'));await refresh();},onError:async()=>{if(useAuthStore.getState().user?.id!==userId)return;Alert.alert(t('failed'),t('pinHelp'));await refresh();}});
  const payout=useMutation({mutationFn:async()=>{const body={amount,method,currency,...proof()};return api.post<{requested:boolean}>(ENDPOINTS.earnings.requestPayout,body,await intent.durableHeaders(body,'payout:'+currency));},onSuccess:async result=>{if(useAuthStore.getState().user?.id!==userId)return;if(!result.requested){Alert.alert(t('failed'));return;}await intent.complete('payout:'+currency);setPin('');setAmount('');Alert.alert(t('requested'));await refresh();},onError:async()=>{if(useAuthStore.getState().user?.id!==userId)return;Alert.alert(t('failed'),t('pinHelp'));await refresh();}});
  const cancel=useMutation({mutationFn:(id:string)=>api.delete(ENDPOINTS.earnings.cancelPayout(id)),onSuccess:refresh,onError:()=>Alert.alert(t('cancelFailed'))});
  const busy=destination.isPending||payout.isPending||cancel.isPending,earnings=query.data;
  const valid=/^\d+(\.\d{1,2})?$/.test(amount)&&Number(amount)>=5&&Number(amount)<=10000&&Number(amount)<=Number(earnings?.available??0),pinReady=!earnings?.pinRequired||/^\d{4}$/.test(pin);
  const price=(value:string)=>new Intl.NumberFormat(locale,{style:'currency',currency}).format(Number(value));
  if(query.isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={t('loading')} color="#d97706"/></View>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
    <View className="flex-row gap-4">{(['USD','NGN','EUR'] as const).map(value=><TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{selected:value===currency,disabled:busy}} disabled={busy} onPress={()=>{setCurrency(value);setMethod(value==='NGN'?'paystack':'manual');setCursor(undefined);setPin('');}}><Text className="font-semibold text-foreground">{value===currency?'● ':''}{value}</Text></TouchableOpacity>)}</View>
    {query.isError||!earnings?<><Text accessibilityRole="alert" className="text-destructive">{t('unavailable')}</Text><Button onPress={()=>query.refetch()}>{t('retry')}</Button></>:<>
      <Card><Text className="font-semibold text-foreground">{t('available')}</Text><Text className="text-4xl font-bold text-foreground">{price(earnings.available)}</Text><Text className="text-muted-foreground">{t('reserved')}: {price(earnings.reserved)}</Text><Text className="text-muted-foreground">{t('paid')}: {price(earnings.paid)}</Text></Card>
      <Text className="text-sm text-muted-foreground">{t('terms',{minimum:price('5')})}</Text>
      {currency==='NGN'&&<View className="flex-row gap-3"><Button disabled={busy} variant={method==='paystack'?'primary':'outline'} onPress={()=>setMethod('paystack')}>{t('paystack')}</Button><Button disabled={busy} variant={method==='manual'?'primary':'outline'} onPress={()=>setMethod('manual')}>{t('manual')}</Button></View>}
      {earnings.pinRequired&&<Input label={t('pin')} accessibilityLabel={t('pin')} secureTextEntry keyboardType="number-pad" maxLength={4} value={pin} onChangeText={value=>setPin(value.replace(/\D/g,'').slice(0,4))} editable={!busy}/>}
      <Card><Input label={t('name')} accessibilityLabel={t('name')} value={name} onChangeText={setName} editable={!busy}/><Input label={t('account')} accessibilityLabel={t('account')} value={account} onChangeText={setAccount} autoCapitalize="characters" editable={!busy}/><Input label={t('bank')} accessibilityLabel={t('bank')} value={bank} onChangeText={setBank} autoCapitalize="characters" editable={!busy}/><Button onPress={()=>destination.mutate()} loading={destination.isPending} disabled={busy||!pinReady||!name||!account||!bank}>{t('save')}</Button></Card>
      <Input label={`${t('amount')} (${currency})`} accessibilityLabel={`${t('amount')} (${currency})`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!busy}/>
      <Button onPress={()=>payout.mutate()} loading={payout.isPending} disabled={busy||!valid||!pinReady} size="lg">{t('request')}</Button>
      <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">{t('history')}</Text>
      {!earnings.payouts.length&&<Text className="text-muted-foreground">{t('empty')}</Text>}
      {earnings.payouts.map(row=><Card key={row.id}><Text className="text-foreground">{price(row.amount)} · {t(`statuses.${row.status}`)}</Text><Text className="text-muted-foreground">{new Date(row.created_at).toLocaleDateString(locale)}</Text>{row.status==='pending'&&<Button onPress={()=>cancel.mutate(row.id)} disabled={busy} variant="outline">{t('cancel')}</Button>}</Card>)}
      {earnings.nextCursor&&<Button disabled={busy} variant="outline" onPress={()=>setCursor(earnings.nextCursor!)}>{t('next')}</Button>}
      <Button disabled={busy} variant="ghost" onPress={()=>refresh()}>{t('refresh')}</Button>
    </>}
  </ScrollView></SafeAreaView>;
}

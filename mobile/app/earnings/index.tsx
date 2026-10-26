import { useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { useAuthStore } from '@/stores/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Earnings {currency:string;available:string;reserved:string;paid:string;payouts:{id:string;amount:string;status:string;created_at:string}[];nextCursor:string|null;}
export default function EarningsScreen() {
  const userId=useAuthStore(state=>state.user?.id);const queryClient=useQueryClient();
  const [currency,setCurrency]=useState<'USD'|'NGN'|'EUR'>('USD');const [cursor,setCursor]=useState<string|undefined>();
  const [method,setMethod]=useState<'manual'|'paystack'>('manual');const [amount,setAmount]=useState('');
  const [name,setName]=useState('');const [account,setAccount]=useState('');const [bank,setBank]=useState('');
  const query=useQuery({queryKey:['earnings',userId,currency,cursor],enabled:!!userId,queryFn:()=>api.get<Earnings>(ENDPOINTS.earnings.list,{currency,cursor})});
  const refresh=()=>queryClient.invalidateQueries({queryKey:['earnings',userId]});
  const destination=useMutation({mutationFn:()=>api.put<{saved:boolean}>(ENDPOINTS.earnings.payoutMethod,{provider:method,currency,display_name:name,account_number:account,bank_code:bank}),onSuccess:result=>Alert.alert(result.saved?'Destination saved':'Destination unavailable',result.saved?'Existing requests retain their captured bank details.':'Please try again.'),onError:()=>Alert.alert('Destination unavailable','Check the bank details and try again.')});
  const payout=useMutation({mutationFn:()=>api.post<{requested:boolean}>(ENDPOINTS.earnings.requestPayout,{amount,method,currency}),onSuccess:async result=>{if(!result.requested){Alert.alert('Payout unavailable','Please try again.');return;}Alert.alert('Payout reserved','Track provider or manual settlement in your payout history.');setAmount('');await refresh();},onError:()=>Alert.alert('Payout unavailable','Check the destination, amount and available balance, then retry.')});
  const cancel=useMutation({mutationFn:(id:string)=>api.delete(ENDPOINTS.earnings.cancelPayout(id)),onSuccess:refresh,onError:()=>Alert.alert('Cannot cancel','The payout may already be processing. Refresh its status.')});
  const busy=destination.isPending||payout.isPending||cancel.isPending;
  const earnings=query.data;const valid=/^\d+(\.\d{1,2})?$/.test(amount)&&Number(amount)>=5&&Number(amount)<=10000&&Number(amount)<=Number(earnings?.available??0);
  const price=(value:string)=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(value));
  if(query.isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706"/></View>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
    <View className="flex-row gap-4">{(['USD','NGN','EUR'] as const).map(value=><TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{selected:value===currency,disabled:busy}} disabled={busy} onPress={()=>{setCurrency(value);setMethod(value==='NGN'?'paystack':'manual');setCursor(undefined);}}><Text className={value===currency?'font-bold text-accent':'text-foreground'}>{value}</Text></TouchableOpacity>)}</View>
    {query.isError||!earnings?<><Text accessibilityRole="alert" className="text-destructive">Earnings unavailable.</Text><Button onPress={()=>query.refetch()}>Retry</Button></>:<>
      <Card><Text className="font-semibold text-foreground">Available balance</Text><Text className="text-4xl font-bold text-foreground">{price(earnings.available)}</Text><Text className="text-muted-foreground">Reserved: {price(earnings.reserved)}</Text><Text className="text-muted-foreground">Paid out: {price(earnings.paid)}</Text></Card>
      <Text className="text-sm text-muted-foreground">Minimum payout: {price('5')}. Save a bank destination first. Requests keep their bank details and currency; no conversion is applied.</Text>
      {currency==='NGN'&&<View className="flex-row gap-3"><Button disabled={busy} variant={method==='paystack'?'primary':'outline'} onPress={()=>setMethod('paystack')}>Paystack</Button><Button disabled={busy} variant={method==='manual'?'primary':'outline'} onPress={()=>setMethod('manual')}>Manual transfer</Button></View>}
      <Card><Input label="Account holder" accessibilityLabel="Account holder" value={name} onChangeText={setName} editable={!busy}/><Input label="Account number or IBAN" accessibilityLabel="Account number or IBAN" value={account} onChangeText={setAccount} autoCapitalize="characters" editable={!busy}/><Input label="Bank or SWIFT code" accessibilityLabel="Bank or SWIFT code" value={bank} onChangeText={setBank} autoCapitalize="characters" editable={!busy}/><Button onPress={()=>destination.mutate()} loading={destination.isPending} disabled={busy||!name||!account||!bank}>Save destination</Button></Card>
      <Input label={`Amount (${currency})`} accessibilityLabel={`Payout amount in ${currency}`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!busy}/>
      <Button onPress={()=>payout.mutate()} loading={payout.isPending} disabled={busy||!valid} size="lg">Request payout</Button>
      <Text className="text-lg font-semibold text-foreground">Payout history</Text>
      {!earnings.payouts.length&&<Text className="text-muted-foreground">No payouts yet.</Text>}
      {earnings.payouts.map(row=><Card key={row.id}><Text className="text-foreground">{price(row.amount)} · {row.status}</Text><Text className="text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</Text>{row.status==='pending'&&<Button onPress={()=>cancel.mutate(row.id)} disabled={busy} variant="outline">Cancel request</Button>}</Card>)}
      {earnings.nextCursor&&<Button disabled={busy} variant="outline" onPress={()=>setCursor(earnings.nextCursor!)}>Older payouts</Button>}
      <Button disabled={busy} variant="ghost" onPress={()=>refresh()}>Refresh</Button>
    </>}
  </ScrollView></SafeAreaView>;
}

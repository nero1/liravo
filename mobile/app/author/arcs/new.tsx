import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewARCScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [bookId,setBookId]=useState('');
  const [slots,setSlots]=useState('5');
  const {data,isLoading,isError}=useQuery({queryKey:['author','arc-books'],queryFn:()=>api.get<{books:{id:string;title:string}[]}>(ENDPOINTS.author.arcs)});
  const books=data?.books??[];
  const readerSlots=Number(slots);
  const validSlots=Number.isInteger(readerSlots)&&readerSlots>=1&&readerSlots<=20;
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => api.post(ENDPOINTS.author.arcs, {book_id:bookId,description,reader_slots:readerSlots}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['author', 'arcs'] }); router.back(); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <View accessibilityRole="radiogroup" className="gap-2">
          <Text className="font-medium text-foreground">Book</Text>
          {isLoading&&<Text className="text-muted-foreground">Loading books…</Text>}
          {isError&&<Text accessibilityRole="alert" className="text-destructive">Unable to load your books.</Text>}
          {!isLoading&&!isError&&books.length===0&&<Text className="text-muted-foreground">Link a book to your author profile before creating an ARC.</Text>}
          {books.map(book=><TouchableOpacity key={book.id} accessibilityRole="radio" accessibilityState={{checked:bookId===book.id}} onPress={()=>setBookId(book.id)} className={`rounded-lg border p-3 ${bookId===book.id?'border-accent':'border-border'}`}><Text className="text-foreground">{book.title}</Text></TouchableOpacity>)}
        </View>
        <Input label="Reader slots (1–20)" value={slots} onChangeText={setSlots} keyboardType="number-pad" maxLength={2} />
        <Input label="ARC Description" value={description} onChangeText={setDescription} placeholder="What should readers know?" multiline maxLength={1000} numberOfLines={4} style={{ textAlignVertical: 'top' }} />
        <Button onPress={() => create.mutate()} loading={create.isPending} disabled={!bookId||!description.trim()||!validSlots} size="lg">Create ARC</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

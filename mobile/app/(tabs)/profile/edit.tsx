import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GENRES,type UserRow,type UserType } from '@/types';
import { Avatar } from '@/components/ui/Avatar';

const roleOptions:UserType[]=['reader','author','newbie_writer','creator'];
export default function EditProfileScreen() {
  const router = useRouter();
  const qc=useQueryClient();
  const { user, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [genres,setGenres]=useState<string[]>(user?.genres??[]);
  const [roles,setRoles]=useState<UserType[]>((user?.user_types??['reader']).filter((value):value is UserType=>roleOptions.includes(value as UserType)));

  const update = useMutation({
    mutationFn: () => api.put<{ user: UserRow }>('/api/users/profile', { display_name: displayName, bio,user_types:roles,genres }),
    onSuccess: (res) => {
      setUser(res.user);
      void qc.invalidateQueries({queryKey:['write','my-plan']});
      void qc.invalidateQueries({queryKey:['taste-profile']});
      router.back();
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 20 }}>
          <View className="items-center">
            <Avatar uri={user?.avatar_url} name={user?.display_name} size={80} />
          </View>
          <Input
            label="Display Name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            maxLength={50}
          />
          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell readers about yourself..."
            multiline
            numberOfLines={4}
            maxLength={280}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
          />
          <View className="gap-3"><Text className="font-semibold text-foreground">Roles</Text>
            {roleOptions.map(role=><TouchableOpacity key={role} accessibilityRole="checkbox" accessibilityState={{checked:roles.includes(role)}} onPress={()=>setRoles(current=>current.includes(role)?current.filter(value=>value!==role):[...current,role])} className="border border-border rounded-xl p-3"><Text className="text-foreground">{roles.includes(role)?'✓ ':''}{{reader:'Reader',author:'Author',newbie_writer:'Newbie Writer',creator:'Book Content Creator'}[role]}</Text></TouchableOpacity>)}
          </View>
          <View className="gap-3"><Text className="font-semibold text-foreground">Genres (choose at least five)</Text><View className="flex-row flex-wrap gap-2">
            {GENRES.map(genre=><TouchableOpacity key={genre} accessibilityRole="checkbox" accessibilityState={{checked:genres.includes(genre)}} onPress={()=>setGenres(current=>current.includes(genre)?current.filter(value=>value!==genre):[...current,genre])} className="border border-border rounded-lg p-2"><Text className="text-foreground">{genres.includes(genre)?'✓ ':''}{genre}</Text></TouchableOpacity>)}
          </View></View>
          <Button disabled={!displayName.trim()||!roles.length||genres.length<5} onPress={() => update.mutate()} loading={update.isPending} size="lg">
            Save Changes
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

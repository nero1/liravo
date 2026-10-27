import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useShelves } from '@/hooks/useShelf';
import { useToggleShelf } from '@/hooks/useBooks';
import type { BookRow } from '@/types';

interface Props {
  book: BookRow;
  visible: boolean;
  onClose: () => void;
}

const DEFAULT_SHELF_LABELS: Record<string, string> = {
  currently_reading: '📖 Currently Reading',
  want_to_read: '🔖 Want to Read',
  have_read: '✅ Have Read',
};

export function AddToShelfModal({ book, visible, onClose }: Props) {
  const { data, isLoading } = useShelves(book.id);
  const toggle = useToggleShelf();

  async function handleSelect(shelfId: string) {
    try{
      await toggle.mutateAsync({bookId:book.id,shelfId,action:data?.addedToShelves.includes(shelfId)?'remove':'add'});
    }catch(error){Alert.alert('Error',error instanceof Error?error.message:'Shelf update failed');}
  }

  const shelves = data?.shelves ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-background rounded-t-2xl p-6 max-h-[60%]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground">Add to Shelf</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#d97706" />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {shelves.map((shelf) => (
                <TouchableOpacity
                  key={shelf.id}
                  className="flex-row items-center py-3 border-b border-border gap-3"
                  onPress={() => handleSelect(shelf.id)}
                  disabled={toggle.isPending}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked:data?.addedToShelves.includes(shelf.id),disabled:toggle.isPending}}
                  activeOpacity={0.7}
                >
                  <Text className="flex-1 text-foreground">
                    {shelf.is_default && shelf.default_type
                      ? DEFAULT_SHELF_LABELS[shelf.default_type] ?? shelf.name
                      : shelf.name}
                  </Text>
                  {data?.addedToShelves.includes(shelf.id)&&<Check size={18} color="#d97706" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

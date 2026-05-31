import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
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
  const { data, isLoading } = useShelves();
  const toggle = useToggleShelf();

  async function handleSelect(shelfType: string) {
    await toggle.mutateAsync({ book_id: book.id, shelf_type: shelfType, google_books_id: book.google_books_id ?? undefined });
    onClose();
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
                  onPress={() => handleSelect(shelf.default_type ?? shelf.slug)}
                  activeOpacity={0.7}
                >
                  <Text className="flex-1 text-foreground">
                    {shelf.is_default && shelf.default_type
                      ? DEFAULT_SHELF_LABELS[shelf.default_type] ?? shelf.name
                      : shelf.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

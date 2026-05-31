import { Modal, View, TouchableOpacity, Text, ActivityIndicator, SafeAreaView as RNSafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useState, useRef } from 'react';
import { X } from 'lucide-react-native';

interface PaymentSheetProps {
  url: string;
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  // URL patterns that signal success or cancellation
  successPattern?: string;
  cancelPattern?: string;
}

export function PaymentSheet({
  url,
  visible,
  onSuccess,
  onCancel,
  successPattern = 'activated=1',
  cancelPattern = 'cancelled=1',
}: PaymentSheetProps) {
  const [loading, setLoading] = useState(true);
  const handled = useRef(false);

  function handleNavigationChange(navState: { url: string }) {
    if (handled.current) return;
    const navUrl = navState.url;
    if (navUrl.includes(successPattern)) {
      handled.current = true;
      onSuccess();
    } else if (navUrl.includes(cancelPattern)) {
      handled.current = true;
      onCancel();
    }
  }

  function handleClose() {
    handled.current = false;
    onCancel();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <RNSafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Header bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
          <Text style={{ fontWeight: '600', fontSize: 16, color: '#111' }}>Complete Payment</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10, backgroundColor: '#fff' }}>
            <ActivityIndicator size="large" color="#d97706" />
          </View>
        )}

        <WebView
          source={{ uri: url }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={handleNavigationChange}
          javaScriptEnabled
          domStorageEnabled
          style={{ flex: 1 }}
        />
      </RNSafeAreaView>
    </Modal>
  );
}

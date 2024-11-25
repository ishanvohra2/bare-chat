import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

interface Message {
  id: string;
  text: string;
  sender: string;
  peerId: string;
  timestamp: string;
}

interface ChatState {
  peerId: string | null;
  messages: Message[];
  isConnected: boolean;
  isLoading: boolean;
}

const API_URL = 'https://bare-backend-production.up.railway.app';
const POLLING_INTERVAL = 10000; // 10 seconds

const P2PChatApp = () => {
  const [state, setState] = useState<ChatState>({
    peerId: null,
    messages: [],
    isConnected: false,
    isLoading: false,
  });
  const [messageInput, setMessageInput] = useState('');
  const [connectToPeerId, setConnectToPeerId] = useState('');

  // Fetch messages from the server
  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/get-messages?peerId=${state.peerId}`);
      const data = await response.json();
      
      if (data.messages) {
        setState(prev => ({
          ...prev,
          messages: data.messages.reverse()
        }));
      }
      console.log(data)
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [state.peerId]);

  // Set up polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (state.isConnected) {
      // Initial fetch
      fetchMessages();

      // Set up polling interval
      pollInterval = setInterval(fetchMessages, POLLING_INTERVAL);
    }

    // Cleanup
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [state.isConnected, fetchMessages]);

  // Generate a new peer ID for the user
  const generatePeerId = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const response = await fetch(`${API_URL}/api/get-peer-id`);
      const data = await response.json();
      
      if (data.id) {
        setState(prev => ({
          ...prev,
          peerId: data.id,
          isLoading: false,
        }));
        Clipboard.setString(data.id);

        Alert.alert('Success', `Your Peer ID: ${data.id}`);
      }
    } catch (error) {
      console.error('Error generating peer ID:', error);
      Alert.alert('Error', 'Failed to generate peer ID');
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Connect to another peer
  const connectToPeer = useCallback(async () => {
    if (!connectToPeerId) {
      Alert.alert('Error', 'Please enter a peer ID to connect');
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const response = await fetch(
        `${API_URL}/api/connect-peers?peerId=${connectToPeerId}`
      );
      const data = await response.json();

      if (data.status === 'connected') {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isLoading: false,
          messages: data.messages || []
        }));
        Alert.alert('Success', 'Connected to peer!');
      }
    } catch (error) {
      console.error('Error connecting to peer:', error);
      Alert.alert('Error', 'Failed to connect to peer');
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [connectToPeerId]);

  // Send a message
  const sendMessage = useCallback(async () => {
    if (!messageInput.trim() || !state.isConnected) {
      Alert.alert('Error', 'Please connect to a peer and enter a message');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: messageInput,
          sender: state.peerId,
          peerId: state.peerId
        })
      });

      const data = await response.json();

      console.log(data)

      if (data.status === 'message sent') {
        setMessageInput('');
        // Fetch messages immediately after sending
        fetchMessages();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  }, [messageInput, state.isConnected, state.peerId, fetchMessages]);

  // Render message item
  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageContainer,
      item.sender === state.peerId ? styles.sentMessage : styles.receivedMessage
    ]}>
      <Text style={styles.senderText}>
        {item.sender === state.peerId ? 'You' : `Peer (${item.sender.slice(0, 8)}...)`}
      </Text>
      <Text style={[
        styles.messageText,
        item.sender === state.peerId ? styles.sentMessageText : styles.receivedMessageText
      ]}>
        {item.text}
      </Text>
      <Text style={styles.timestampText}>
        {new Date(item.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {state.isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>P2P Chat</Text>
        {state.peerId && (
          <Text style={styles.peerIdText}>Your ID: {state.peerId}</Text>
        )}
      </View>

      {!state.peerId ? (
        <TouchableOpacity
          style={styles.button}
          onPress={generatePeerId}
          disabled={state.isLoading}
        >
          <Text style={styles.buttonText}>Generate Peer ID</Text>
        </TouchableOpacity>
      ) : !state.isConnected ? (
        <View style={styles.connectionContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter Peer ID to connect"
            value={connectToPeerId}
            onChangeText={setConnectToPeerId}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={connectToPeer}
            disabled={state.isLoading}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chatContainer}>
          <FlatList
            data={state.messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            style={styles.messagesList}
            inverted
          />
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder="Type a message..."
              value={messageInput}
              onChangeText={setMessageInput}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !messageInput.trim() && styles.sendButtonDisabled
              ]}
              onPress={sendMessage}
              disabled={!messageInput.trim()}
            >
              <Text style={styles.buttonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  peerIdText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  connectionContainer: {
    padding: 16,
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  chatContainer: {
    flex: 1,
    padding: 16,
  },
  messagesList: {
    flex: 1,
  },
  messageContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    maxWidth: '80%',
  },
  sentMessage: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    backgroundColor: '#E5E5EA',
    alignSelf: 'flex-start',
  },
  senderText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
  },
  timestampText: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 8,
    marginTop: 16,
  },
  messageInput: {
    flex: 1,
    padding: 8,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  sentMessageText: {
    color: '#ffffff',
  },
  receivedMessageText: {
    color: '#000000',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  lastPolledText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default P2PChatApp;
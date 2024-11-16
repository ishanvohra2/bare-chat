import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  Button, 
  StyleSheet,
  ListRenderItem 
} from 'react-native';
import { Worklet } from 'react-native-bare-kit';
import { ChatMessage, WorkletMessage, Peer, P2PMessage } from './types';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [worklet, setWorklet] = useState<Worklet | null>(null);
  const [rpc, setRpc] = useState<any>(null);
  const [peerId, setPeerId] = useState<string>('');

  useEffect(() => {
    initializeChat();
    return () => {
      if (worklet) worklet.terminate();
    };
  }, []);

  const initializeChat = async (): Promise<void> => {
    const chatWorklet = new Worklet();
    try {
        await chatWorklet.start('/app.js', `
            const rpc = new BareKit.RPC((req) => {
              // Add logging function
              const sendLog = (message) => {
                const logReq = rpc.request('workletLog');
                logReq.send(message);
              };
          
              // Handle peer discovery
              if (req.command === 'discover') {
                sendLog('Discovering peers...');
                const peerId = BareKit.getId();
                rpc.broadcast('peer-announce', {
                  peerId,
                  name: 'User-' + peerId.substring(0, 5)
                });
                req.reply(peerId);
              }
          
              // Handle messages
              if (req.command === 'message') {
                try {
                  sendLog('Processing message: ' + JSON.stringify(req.data));
                  const notifyReq = rpc.request('messageReceived');
                  notifyReq.send({
                    ...req.data,
                    timestamp: Date.now(),
                  });
                  req.reply('processed');
                } catch (err) {
                  sendLog('Error: ' + err.message);
                  req.reply('error');
                }
              }
            });
          `);
      
      const rpcInstance = new chatWorklet.RPC((req: WorkletMessage) => {
        if (req.command === 'workletLog') {
            console.log('Worklet Log', req.data.toString());
            req.reply('logged');
          }
        if (req.command === 'messageReceived') {
          setMessages(prev => [...prev, req.data]);
          req.reply('received');
        }

        if (req.command === 'peerDiscovered') {
          setPeers(prev => {
            const exists = prev.some(p => p.id === req.data.peerId);
            if (!exists) {
              return [...prev, {
                id: req.data.peerId,
                name: req.data.name,
                isConnected: true
              }];
            }
            return prev;
          });
          req.reply('acknowledged');
        }
      });

      setWorklet(chatWorklet);
      setRpc(rpcInstance);

      // Start peer discovery
      const req = rpcInstance.request('discover');
      const myPeerId = await req.reply();
      setPeerId(myPeerId);
    } catch(error) {
      console.error('Failed to initialize chat:', error);
    }
  };

  const sendMessage = async (): Promise<void> => {
    if (!inputText.trim() || !rpc) return;
  
    const newMessage: ChatMessage = {
        text: inputText,
        sender: 'Me',
        timestamp: Date.now()
    };

    try {
      // Add message to local state immediately
      setMessages(prev => [...prev, newMessage]);
  
      // Send to worklet with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Send timeout')), 5000);
      });
  
      const sendPromise = new Promise(async (resolve, reject) => {
        try {
          const req = rpc.request('message');
          req.send(inputText);
          const response = await req.reply();
          console.log("Send Message", response);
          resolve(response);
        } catch (err) {
          reject(err);
        }
      });
  
      await Promise.race([timeoutPromise, sendPromise]);
      setInputText('');
    } catch(error) {
      console.error('Failed to send message:', error);
      // Optionally remove the message from local state if send failed
      setMessages(prev => prev.filter(msg => msg !== newMessage));
    }
  };

  const renderMessage: ListRenderItem<ChatMessage> = ({ item }) => (
    <View style={styles.messageContainer}>
      <Text style={styles.sender}>{item.sender}</Text>
      <Text style={styles.messageText}>{item.text}</Text>
      <Text style={styles.timestamp}>
        {new Date(item.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );

  const renderPeerList = () => (
    <View style={styles.peerList}>
      <Text style={styles.peerHeader}>Connected Peers ({peers.length})</Text>
      {peers.map(peer => (
        <Text key={peer.id} style={styles.peerItem}>
          {peer.name} ({peer.isConnected ? 'Online' : 'Offline'})
        </Text>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {renderPeerList()}
      <FlatList
        data={messages}
        keyExtractor={(item) => 
          'messageId' in item 
            ? (item as P2PMessage).messageId 
            : item.timestamp.toString()
        }
        renderItem={renderMessage}
        style={styles.messageList}
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          onSubmitEditing={sendMessage}
        />
        <Button title="Send" onPress={sendMessage} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
  },
  messageList: {
    flex: 1,
  },
  messageContainer: {
    padding: 10,
    marginVertical: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
  sender: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  messageText: {
    fontSize: 16,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    marginRight: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
  },
  peerList: {
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  peerHeader: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  peerItem: {
    padding: 5,
    color: '#666',
  },
});

export default App;
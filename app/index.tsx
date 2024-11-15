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
import { ChatMessage, WorkletMessage } from './types';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [worklet, setWorklet] = useState<Worklet | null>(null);
  const [rpc, setRpc] = useState<any>(null);

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
          if (req.command === 'ping') {
            console.log(req.data.toString());
            req.reply('Hello from Bare!');
          }
      
          if (req.command === 'message') {
            try {
              const notifyReq = rpc.request('messageReceived');
              notifyReq.send({
                text: req.data,
                sender: 'User',
                timestamp: Date.now(),
              });
              notifyReq.reply();
              req.reply('processed');
            } catch (err) {
              console.error('Message handling error:', err);
              req.reply('error');
            }
          }
        });
      `);
      
      const rpcInstance = new chatWorklet.RPC((req: WorkletMessage) => {
        console.log('RPC request received:', req.command, req.data.toString())
        if (req.command === 'messageReceived') {
          setMessages(prev => [...prev, req.data]);
          req.reply('received');
          console.log('Message received')
        }
      });

      setWorklet(chatWorklet);
      setRpc(rpcInstance);
    } catch(error) {
      console.error('Failed to initialize chat:', error);
    }
  };


  const sendMessage = async (): Promise<void> => {
    if (!inputText.trim() || !rpc) return;

    try {
      // Add message to local state immediately
      const newMessage: ChatMessage = {
        text: inputText,
        sender: 'Me',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, newMessage]);

      // Send to worklet
      const req = rpc.request('message');
      req.send(inputText);
      console.log("Sending", inputText)
      await req.reply().then((res: string) => console.log(res));
      setInputText('');
    } catch(error) {
      console.error('Failed to send message:', error);
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

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.timestamp.toString()}
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
});

export default App;
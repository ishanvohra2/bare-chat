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
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices
} from 'react-native-webrtc';
import { ChatMessage, WorkletMessage, Peer, P2PMessage } from './types';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [worklet, setWorklet] = useState<Worklet | null>(null);
  const [rpc, setRpc] = useState<any>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [peerConnections, setPeerConnections] = useState<{[key: string]: RTCPeerConnection}>({});

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  const createPeerConnection = (targetPeerId: string) => {
    const peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && rpc) {
        const req = rpc.request('ice-candidate');
        req.send({
          peerId: targetPeerId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      setPeers(prev => prev.map(p => 
        p.id === targetPeerId 
          ? {...p, isConnected: peerConnection.connectionState === 'connected'}
          : p
      ));
    };

    peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      setupDataChannel(channel, targetPeerId);
    };

    setPeerConnections(prev => ({...prev, [targetPeerId]: peerConnection}));
    return peerConnection;
  };

  const setupDataChannel = (channel: RTCDataChannel, targetPeerId: string) => {
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, {
        ...message,
        sender: peers.find(p => p.id === targetPeerId)?.name || 'Unknown'
      }]);
    };
  };

  useEffect(() => {
    initializeChat();
    return () => {
      if (worklet) worklet.terminate();
      Object.values(peerConnections).forEach(pc => pc.close());
    };
  }, []);

  const initializeChat = async (): Promise<void> => {
    const chatWorklet = new Worklet();
    try {
        await chatWorklet.start('/app.js', `
            const rpc = new BareKit.RPC((req) => {
          const sendLog = (message) => {
            const logReq = rpc.request('workletLog');
            logReq.send(message);
          };

          if (req.command === 'discover') {
            sendLog('Discovering peers...');
            const peerId = BareKit.getId();
            rpc.broadcast('peer-announce', {
              peerId,
              name: 'User-' + peerId.substring(0, 5)
            });
            req.reply(peerId);
          }

          if (req.command === 'ice-candidate') {
            const signalingReq = rpc.request('handle-ice-candidate');
            signalingReq.send(req.data);
            req.reply('received');
          }

          if (req.command === 'offer') {
            const signalingReq = rpc.request('handle-offer');
            signalingReq.send(req.data);
            req.reply('received');
          }

          if (req.command === 'answer') {
            const signalingReq = rpc.request('handle-answer');
            signalingReq.send(req.data);
            req.reply('received');
          }
        });
          `);
      
      const rpcInstance = new chatWorklet.RPC((req: WorkletMessage) => {
        if (req.command === 'workletLog') {
            console.log('Worklet Log', req.data.toString());
            req.reply('logged');
          }
          if (req.command === 'handle-ice-candidate') {
            const { peerId, candidate } = req.data;
            const pc = peerConnections[peerId];
            if (pc) {
              pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            req.reply('processed');
          }
  
          if (req.command === 'handle-offer') {
            const { peerId, offer } = req.data;
            const pc = createPeerConnection(peerId);
            pc.setRemoteDescription(new RTCSessionDescription(offer))
              .then(() => pc.createAnswer())
              .then(answer => pc.setLocalDescription(answer))
              .then(() => {
                const req = rpc.request('answer');
                req.send({
                  peerId,
                  answer: pc.localDescription
                });
              });
            req.reply('processed');
          }
  
          if (req.command === 'handle-answer') {
            const { peerId, answer } = req.data;
            const pc = peerConnections[peerId];
            if (pc) {
              pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
            req.reply('processed');
          }
  
          if (req.command === 'peerDiscovered') {
            setPeers(prev => {
              const exists = prev.some(p => p.id === req.data.peerId);
              if (!exists) {
                // Initiate WebRTC connection
                const pc = createPeerConnection(req.data.peerId);
                const dataChannel = pc.createDataChannel('messageChannel');
                setupDataChannel(dataChannel, req.data.peerId);
                
                pc.createOffer()
                  .then(offer => pc.setLocalDescription(offer))
                  .then(() => {
                    const offerReq = rpc.request('offer');
                    offerReq.send({
                      peerId: req.data.peerId,
                      offer: pc.localDescription
                    });
                  });
  
                return [...prev, {
                  id: req.data.peerId,
                  name: req.data.name,
                  isConnected: false
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
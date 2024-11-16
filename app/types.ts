export interface ChatMessage {
  text: string;
  sender: string;
  timestamp: number;
}

export interface Peer {
  id: string;
  name: string;
  isConnected: boolean;
}

export interface P2PMessage extends ChatMessage {
  peerId: string;
  messageId: string;
}

export interface WorkletMessage {
  command: string;
  data: any;
  reply: (response?: any) => void;
}
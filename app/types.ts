// types.ts
export interface ChatMessage {
    text: string;
    sender: string;
    timestamp: number;
  }
  
  export interface WorkletMessage {
    command: string;
    data: any;
    reply: (response?: any) => void;
  }
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot } from 'lucide-react';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import ConversationsList from '@/components/chat/ConversationsList';

const AGENT_NAME = 'dr_adri_bot';

export default function BotChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const messagesEndRef = useRef(null);

  // Load conversations list
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setIsLoadingList(true);
    const list = await base44.agents.listConversations({ agent_name: AGENT_NAME });
    setConversations(list || []);
    setIsLoadingList(false);
  };

  // Load active conversation and subscribe
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      setActiveConv(null);
      return;
    }

    let unsubscribe;
    const init = async () => {
      const conv = await base44.agents.getConversation(activeConvId);
      setActiveConv(conv);
      setMessages(conv.messages || []);

      unsubscribe = base44.agents.subscribeToConversation(activeConvId, (data) => {
        setMessages(data.messages || []);
      });
    };
    init();

    return () => { if (unsubscribe) unsubscribe(); };
  }, [activeConvId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateConversation = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: `בדיקה ${new Date().toLocaleDateString('he-IL')}` },
    });
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
  };

  const handleSend = async (text) => {
    if (!activeConv) return;
    setIsSending(true);
    await base44.agents.addMessage(activeConv, { role: 'user', content: text });
    setIsSending(false);
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex rounded-xl overflow-hidden border border-border bg-background">
      {/* Conversations list - right side (RTL) */}
      <div className="w-64 flex-shrink-0 hidden md:block">
        <ConversationsList
          conversations={conversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onCreate={handleCreateConversation}
          isLoading={isLoadingList}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">בוט ד״ר אדרי</p>
            <p className="text-xs text-muted-foreground">בדיקת שיחות</p>
          </div>
          {/* Mobile: new chat button */}
          <button
            onClick={handleCreateConversation}
            className="md:hidden mr-auto text-xs text-primary underline"
          >
            שיחה חדשה
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeConvId ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">בחרי שיחה קיימת או צרי שיחה חדשה</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-muted-foreground text-sm">שלחי הודעה כדי להתחיל</p>
            </div>
          ) : (
            messages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeConvId && <ChatInput onSend={handleSend} disabled={isSending} />}
      </div>
    </div>
  );
}
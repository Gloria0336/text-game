import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  GameState, 
  Message, 
  DEFAULT_CHARACTER,
  DEFAULT_WORLD,
  OpenRouterModel
} from './types';
import { INITIAL_STYLE_BOOK } from './constants';
import { fetchModels, generateCompletion } from './services/openRouterService';
import Button from './components/Button';
import Input from './components/Input';

// --- Book Logic Constants ---
const CHARS_PER_PAGE = 220; 

interface BookPage {
  id: number;
  content: { role: string; text: string }[];
}

const App: React.FC = () => {
  // --- State Initialization ---
  const [gameState, setGameState] = useState<GameState>({
    apiKey: '',
    selectedModel: '',
    models: [],
    customStyle: INITIAL_STYLE_BOOK,
    
    viewMode: 'GM', 
    showSettings: true,
    isGameStarted: false,
    
    world: DEFAULT_WORLD,
    character: DEFAULT_CHARACTER,
    
    gmMessages: [{ role: 'assistant', content: '你好！我是你的專屬 GM。我們可以一起討論你想玩什麼類型的遊戲，設定世界觀與角色。\n\n你可以直接告訴我：「我想玩一個賽博龐克的偵探故事」或是「我想當一個在修仙界種田的農夫」。\n\n即使你的想法只有一個詞，點擊下方的「確認設定並開始冒險」，我就會為你自動填補所有細節，開啟一段完整的傳奇之旅！' }],
    messages: [],
    
    summary: '遊戲尚未開始。',
    turnCount: 0,
    isLoading: false,
    error: null,
  });

  const [inputMessage, setInputMessage] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingStep, setLoadingStep] = useState(''); 
  
  // Book State
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  // Refs for scrolling
  const gmChatEndRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // --- Helper: Update State ---
  const updateState = (updates: Partial<GameState>) => {
    setGameState(prev => ({ ...prev, ...updates }));
  };

  const handleError = (error: any) => {
    console.error("Game Error Details:", error);
    const msg = typeof error === 'string' ? error : (error.message || '發生未知錯誤');
    updateState({ error: msg, isLoading: false });
    setLoadingStep('');
    setTimeout(() => updateState({ error: null }), 6000);
  };

  // --- Logic: Book Pagination ---
  const bookPages = useMemo(() => {
    const pages: BookPage[] = [];
    let currentPageContent: { role: string; text: string }[] = [];
    let currentCharCount = 0;
    let pageIdCounter = 0;

    gameState.messages.forEach((msg) => {
      let displayContent = msg.content.replace(/---UPDATE_START---[\s\S]*?---UPDATE_END---/, '').trim();
      // 過濾 <think> 標籤內容不顯示在書本中
      displayContent = displayContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      
      if (!displayContent) return;

      const blocks = displayContent.split('\n').filter(b => b.trim() !== '');
      
      blocks.forEach(block => {
        if (currentCharCount + block.length > CHARS_PER_PAGE && currentPageContent.length > 0) {
          pages.push({ id: pageIdCounter++, content: [...currentPageContent] });
          currentPageContent = [];
          currentCharCount = 0;
        }

        if (block.length > CHARS_PER_PAGE) {
           let remaining = block;
           while (remaining.length > 0) {
             const chunk = remaining.slice(0, CHARS_PER_PAGE);
             remaining = remaining.slice(CHARS_PER_PAGE);
             
             if (currentCharCount + chunk.length > CHARS_PER_PAGE && currentPageContent.length > 0) {
                pages.push({ id: pageIdCounter++, content: [...currentPageContent] });
                currentPageContent = [];
                currentCharCount = 0;
             }
             currentPageContent.push({ role: msg.role, text: chunk });
             currentCharCount += chunk.length;
           }
        } else {
          currentPageContent.push({ role: msg.role, text: block });
          currentCharCount += block.length;
        }
      });
    });

    if (currentPageContent.length > 0) {
      pages.push({ id: pageIdCounter++, content: currentPageContent });
    }
    
    if (pages.length === 0) pages.push({ id: 0, content: [{ role: 'system', text: '故事尚未開始...' }] });

    return pages;
  }, [gameState.messages]);

  // --- Effects ---
  useEffect(() => {
    if (gameState.viewMode === 'RP' && bookPages.length > 0) {
      setCurrentPageIndex(bookPages.length - 1);
    }
  }, [bookPages.length, gameState.viewMode]);

  useEffect(() => {
    if (gameState.viewMode === 'GM') {
      const timer = setTimeout(() => {
        gmChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [gameState.gmMessages, gameState.viewMode]);

  useEffect(() => {
    if (showHistory) {
      setTimeout(() => historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [showHistory, gameState.messages]);

  // --- API: Model Fetching ---
  const handleFetchModels = async () => {
    const key = gameState.apiKey.trim();
    if (!key) {
      handleError('請先輸入 OpenRouter API Key');
      return;
    }
    updateState({ isLoading: true, error: null });
    try {
      const models = await fetchModels(key);
      updateState({ 
        models, 
        isLoading: false, 
        selectedModel: gameState.selectedModel || models.find(m => m.id.includes('gemini-2.0-flash-exp'))?.id || models[0]?.id || '' 
      });
    } catch (err) {
      handleError(err);
    }
  };

  // --- Logic: GM Mode (Chat) ---
  const handleSendGMMessage = async () => {
    if (!inputMessage.trim() || gameState.isLoading) return;
    const newMsgs: Message[] = [...gameState.gmMessages, { role: 'user', content: inputMessage }];
    updateState({ gmMessages: newMsgs, isLoading: true, error: null });
    setInputMessage('');

    try {
      const systemPrompt = `你是一個專業的 TRPG 設計師。目標是協助玩家建立有趣的世界觀。請回應玩家的想法，若想法不足，主動提出兩個有趣的擴展建議方案。`;

      const response = await generateCompletion(
        gameState.apiKey,
        gameState.selectedModel,
        [{ role: 'system', content: systemPrompt }, ...newMsgs.slice(-10)]
      );

      updateState({ 
        gmMessages: [...newMsgs, { role: 'assistant', content: response }],
        isLoading: false 
      });
    } catch (err) {
      handleError(err);
    }
  };

  // --- Logic: Sync Settings & Start Game ---
  const handleSyncAndStart = async () => {
    if (gameState.isLoading) return;
    if (!gameState.apiKey) {
      handleError('請先在設定中輸入 API Key');
      updateState({ showSettings: true });
      return;
    }
    if (!gameState.selectedModel) {
      handleError('請先獲取模型清單並選擇一個模型');
      updateState({ showSettings: true });
      return;
    }

    updateState({ isLoading: true, error: null });
    setLoadingStep('正在編織世界的命運... (解析設定中)');

    const extractPrompt = `
      任務：根據對話紀錄生成冒險 JSON。
      指令：如果對話中缺乏世界觀細節、角色屬性或背景，請你根據已知的主題發揮創意自行補完。
      你必須生成一個完整的設定，絕不能返回空值或詢問玩家。
      
      重要：你必須輸出合法的 JSON。
      必須輸出的 JSON 結構：
      {
        "world": { "name": "世界名", "description": "詳細描述", "promptMix": "風格標籤" },
        "character": {
          "name": "角色名", "race": "種族", "class": "職業", "level": 1,
          "hp": 100, "maxHp": 100, "mp": 50, "maxMp": 50,
          "attributes": { "力量": 10, "敏捷": 10, "智力": 10, "體質": 10 },
          "skills": ["技能1"], "inventory": ["基礎物品"], "background": "完整的背景故事"
        }
      }
    `;

    try {
      const jsonStr = await generateCompletion(
        gameState.apiKey,
        gameState.selectedModel,
        [{ role: 'system', content: extractPrompt }, ...gameState.gmMessages],
        0.3,
        'json_object'
      );
      
      // 清理可能的思考內容或 Markdown 標籤
      let cleanJson = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      cleanJson = cleanJson.replace(/```json|```/g, '').trim();
      
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("AI 輸出的格式有誤，請嘗試更換模型或重新點擊。");
      }
      
      const data = JSON.parse(jsonMatch[0]);
      const newWorld = { ...DEFAULT_WORLD, ...data.world };
      const newChar = { ...DEFAULT_CHARACTER, ...data.character };

      setLoadingStep('正在填充時空的空白... (生成開場白)');

      let newMessages = gameState.messages;
      if (!gameState.isGameStarted || gameState.messages.length === 0) {
        const openingPrompt = `
          [世界] ${newWorld.name}: ${newWorld.description}
          [風格] ${newWorld.promptMix}
          [角色] ${newChar.name} (${newChar.race} ${newChar.class})
          請撰寫冒險的第一章節。使用優美的繁體中文描述此刻的場景感，並以一個突發事件結尾。
        `;
        
        const openingText = await generateCompletion(
          gameState.apiKey,
          gameState.selectedModel,
          [{ role: 'system', content: openingPrompt }]
        );
        newMessages = [{ role: 'assistant', content: openingText }];
      }

      updateState({
        world: newWorld,
        character: newChar,
        messages: newMessages,
        isGameStarted: true,
        viewMode: 'RP',
        isLoading: false
      });
      setLoadingStep('');

    } catch (err) {
      handleError(err);
    }
  };

  // --- Logic: RP Mode (Game Loop) ---
  const handleSendRPMessage = async () => {
    if (!inputMessage.trim() || gameState.isLoading) return;
    const newMessages: Message[] = [...gameState.messages, { role: 'user', content: inputMessage }];
    updateState({ messages: newMessages, isLoading: true, error: null });
    setInputMessage('');

    try {
      const systemPrompt = `
        你是一個專業的 TRPG GM。
        [當前世界] ${gameState.world?.name}
        [角色狀態] ${JSON.stringify(gameState.character)}
        [指令] 描述玩家行動後的反應。若要更新數值，結尾附上：---UPDATE_START--- {"hp_change": -5} ---UPDATE_END---
        使用繁體中文，生動地描述。
      `;

      const responseContent = await generateCompletion(
        gameState.apiKey,
        gameState.selectedModel,
        [{ role: 'system', content: systemPrompt }, ...newMessages.slice(-10)]
      );

      let finalContent = responseContent;
      const updateRegex = /---UPDATE_START---([\s\S]*?)---UPDATE_END---/;
      const match = responseContent.match(updateRegex);

      if (match) {
        try {
          const updateData = JSON.parse(match[1]);
          finalContent = responseContent.replace(updateRegex, '').trim();
          
          const newChar = { ...gameState.character };
          if (updateData.hp_change) newChar.hp = Math.min(newChar.maxHp, Math.max(0, newChar.hp + updateData.hp_change));
          if (updateData.mp_change) newChar.mp = Math.min(newChar.maxMp, Math.max(0, newChar.mp + updateData.mp_change));
          if (updateData.add_inventory) updateData.add_inventory.forEach((i: string) => newChar.inventory.push(i));
          
          updateState({ character: newChar });
        } catch (e) { console.warn("Update parse fail", e); }
      }

      updateState({ 
        messages: [...newMessages, { role: 'assistant', content: finalContent }],
        isLoading: false,
        turnCount: gameState.turnCount + 1
      });

    } catch (err) {
      handleError(err);
    }
  };

  const flipPage = (direction: 'prev' | 'next') => {
    if (isFlipping) return;
    if (direction === 'prev' && currentPageIndex > 0) {
      setIsFlipping(true);
      setTimeout(() => { setCurrentPageIndex(p => p - 1); setIsFlipping(false); }, 300);
    }
    if (direction === 'next' && currentPageIndex < bookPages.length - 1) {
      setIsFlipping(true);
      setTimeout(() => { setCurrentPageIndex(p => p + 1); setIsFlipping(false); }, 300);
    }
  };

  // 格式化訊息顯示（支援 <think> 推理過程）
  const renderMessageContent = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      const thinkPart = thinkMatch[1].trim();
      const mainPart = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      return (
        <div className="space-y-3">
          {thinkPart && (
            <details className="bg-black/20 rounded-lg overflow-hidden border border-white/5">
              <summary className="px-3 py-2 text-[10px] text-rpg-muted cursor-pointer hover:bg-white/5 transition-colors uppercase tracking-widest font-bold">
                查看思考過程 (Reasoning)
              </summary>
              <div className="px-3 py-3 text-xs italic text-rpg-muted/80 whitespace-pre-wrap font-mono leading-relaxed border-t border-white/5">
                {thinkPart}
              </div>
            </details>
          )}
          <div className="whitespace-pre-wrap leading-relaxed">{mainPart}</div>
        </div>
      );
    }
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
  };

  // --- Renders ---

  const renderHistoryLog = () => (
    <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col p-6 animate-fade-in">
      <div className="flex-none flex justify-between items-center mb-6 border-b border-rpg-700 pb-4">
        <div>
          <h3 className="text-2xl font-bold text-rpg-accent italic">冒險紀錄卷軸</h3>
          <p className="text-sm text-rpg-muted">此卷軸記載了你在「{gameState.world.name}」的所有足跡</p>
        </div>
        <button onClick={() => setShowHistory(false)} className="bg-rpg-accent text-rpg-900 font-bold px-6 py-2 rounded-full hover:bg-cyan-400 transition-colors">收起卷軸</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-4 custom-scrollbar scroll-smooth">
        {gameState.messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-5 rounded-2xl shadow-lg border ${
              msg.role === 'user' 
                ? 'bg-rpg-accent/10 border-rpg-accent/30 text-white' 
                : 'bg-rpg-800/60 border-rpg-700 text-gray-200'
            }`}>
              <div className="text-[10px] uppercase font-bold tracking-widest opacity-40 mb-2">{msg.role === 'user' ? '玩家行動' : 'GM 描述'}</div>
              {renderMessageContent(msg.content.replace(/---UPDATE_START---[\s\S]*?---UPDATE_END---/, '').trim())}
            </div>
          </div>
        ))}
        <div ref={historyEndRef} className="h-4" />
      </div>
    </div>
  );

  const renderSettingsModal = () => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 animate-fade-in">
      <div className="bg-rpg-800 w-full max-w-lg rounded-3xl shadow-2xl border border-rpg-600 p-8">
        <h3 className="text-2xl font-bold text-rpg-accent mb-8 flex items-center gap-2">
          <span>⚙️</span> 系統設定中心
        </h3>
        <div className="space-y-6">
          <Input 
            label="OpenRouter API Key" 
            type="password" 
            placeholder="sk-or-..." 
            value={gameState.apiKey} 
            onChange={(e) => updateState({ apiKey: e.target.value })} 
          />
          <Button onClick={handleFetchModels} isLoading={gameState.isLoading} className="w-full" variant="secondary">
            重新獲取 AI 模型清單
          </Button>
          <div>
            <label className="block text-sm font-medium text-rpg-muted mb-2">模型選擇</label>
            <select 
              className="w-full bg-rpg-900 border border-rpg-700 text-rpg-text rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-rpg-accent transition-all cursor-pointer" 
              value={gameState.selectedModel} 
              onChange={(e) => updateState({ selectedModel: e.target.value })}
            >
              <option value="">-- 請先獲取清單 --</option>
              {gameState.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <p className="mt-2 text-[10px] text-rpg-muted italic">提示：推薦選用 Gemini-2.0-Flash 或 DeepSeek R1。</p>
          </div>
        </div>
        <div className="mt-10 flex gap-4">
           <Button onClick={() => updateState({ showSettings: false })} variant="ghost" className="flex-1">關閉視窗</Button>
           <Button onClick={() => updateState({ showSettings: false })} disabled={!gameState.apiKey || !gameState.selectedModel} className="flex-1">完成並開始冒險</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-rpg-900 text-rpg-text font-serif flex overflow-hidden">
      {gameState.showSettings && renderSettingsModal()}
      {showHistory && renderHistoryLog()}
      
      {gameState.error && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-red-600/90 backdrop-blur px-8 py-4 rounded-2xl shadow-2xl border border-white/20 animate-fade-in flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <span className="font-bold">{gameState.error}</span>
        </div>
      )}

      {loadingStep && (
        <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
           <div className="w-16 h-16 border-4 border-rpg-accent border-t-transparent rounded-full animate-spin mb-6"></div>
           <div className="text-xl font-bold text-rpg-accent animate-pulse">{loadingStep}</div>
           <p className="mt-2 text-rpg-muted text-sm text-center px-4">正在根據您的偏好填充細節...</p>
        </div>
      )}
      
      <div className="flex-1 h-full w-full relative overflow-hidden">
        {gameState.viewMode === 'GM' ? (
          <div className="flex flex-col h-full bg-[#1e293b]/50 relative overflow-hidden">
            <header className="flex-none p-6 bg-rpg-800/80 backdrop-blur flex justify-between items-center border-b border-rpg-700 z-10">
              <div>
                <h2 className="text-xl font-bold text-rpg-accent">GM 創意工坊</h2>
                <p className="text-xs text-rpg-muted italic">「在此描繪故事的輪廓，細節交由我來補完。」</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => updateState({ gmMessages: [{ role: 'assistant', content: '對話已重置。' }] })}>🗑️ 重置</Button>
                <Button variant="ghost" size="sm" onClick={() => updateState({ showSettings: true })}>⚙️ 設定</Button>
              </div>
            </header>
            
            <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-6 pb-12">
                {gameState.gmMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[85%] md:max-w-[75%] p-4 rounded-2xl shadow-md border ${msg.role === 'user' ? 'bg-rpg-accent/20 border-rpg-accent/30 text-white rounded-tr-none' : 'bg-rpg-800 border-rpg-700 text-gray-200 rounded-tl-none'}`}>
                      <div className="text-[9px] uppercase tracking-tighter opacity-30 mb-1 font-bold">{msg.role === 'user' ? '玩家輸入' : 'GM 回應'}</div>
                      {renderMessageContent(msg.content)}
                    </div>
                  </div>
                ))}
                <div ref={gmChatEndRef} className="h-4" />
              </div>
            </main>

            <footer className="flex-none p-6 bg-rpg-800/90 border-t border-rpg-700 backdrop-blur-md z-10">
              <div className="max-w-4xl mx-auto flex flex-col gap-4">
                <div className="flex gap-3">
                  <input 
                    className="flex-1 bg-rpg-900 border border-rpg-700 rounded-2xl p-4 text-rpg-text focus:ring-2 focus:ring-rpg-accent outline-none transition-all placeholder:text-rpg-muted/40 shadow-inner" 
                    placeholder="輸入冒險主題或具體想法..." 
                    value={inputMessage} 
                    onChange={(e) => setInputMessage(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleSendGMMessage()} 
                    disabled={gameState.isLoading}
                  />
                  <Button onClick={handleSendGMMessage} isLoading={gameState.isLoading} className="px-8 rounded-2xl">交流</Button>
                </div>
                <Button variant="primary" className="w-full py-4 text-xl font-bold shadow-rpg-accent/20 rounded-2xl" onClick={handleSyncAndStart} isLoading={gameState.isLoading}>
                  {gameState.isGameStarted ? '同步修改並返回冒險' : '確認設定並開始冒險'}
                </Button>
              </div>
            </footer>
          </div>
        ) : (
          <div className="flex flex-col h-full bg-[#050505] relative overflow-hidden">
            {/* Book UI */}
            <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
               {/* Linear Log Button */}
               <button onClick={() => setShowHistory(true)} className="absolute top-6 left-6 z-30 bg-rpg-800/80 hover:bg-rpg-700 backdrop-blur px-5 py-2.5 rounded-full border border-white/10 text-xs text-white/90 transition-all shadow-xl">📜 冒險全卷</button>
               
               <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10">
                 <button onClick={() => flipPage('prev')} disabled={currentPageIndex === 0} className="p-5 bg-white/5 rounded-full hover:bg-white/10 text-white disabled:opacity-0 transition-all border border-white/5 shadow-2xl">◀</button>
               </div>
               <div className="absolute right-6 top-1/2 -translate-y-1/2 z-10">
                 <button onClick={() => flipPage('next')} disabled={currentPageIndex === bookPages.length - 1} className="p-5 bg-white/5 rounded-full hover:bg-white/10 text-white disabled:opacity-0 transition-all border border-white/5 shadow-2xl">▶</button>
               </div>

               <div className={`relative w-full max-w-[560px] h-[84vh] bg-rpg-paper text-rpg-ink book-shadow rounded-sm transition-all duration-700 transform-gpu ${isFlipping ? 'opacity-30 translate-x-12 rotate-1 scale-90' : 'opacity-100 translate-x-0 rotate-0 scale-100'}`}>
                 <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1.5px, transparent 0.5px)', backgroundSize: '16px 16px' }}></div>
                 <div className="absolute top-4 left-0 right-0 text-center text-[9px] text-rpg-ink/40 font-serif tracking-widest uppercase font-bold">
                   {gameState.world.name} — 第 {currentPageIndex + 1} 頁
                 </div>
                 <div className="absolute top-12 bottom-12 left-12 right-12 writing-vertical-rl text-orientation-mixed font-serif text-2xl leading-[2.6] overflow-hidden flex flex-col items-start select-none">
                   {bookPages[currentPageIndex]?.content.map((b, idx) => (
                     <div key={idx} className={`${b.role === 'user' ? 'font-bold border-r-[3px] border-rpg-ink/10 pr-3' : ''} mb-6 tracking-wide`}>
                       {b.text}
                     </div>
                   ))}
                   {gameState.isLoading && currentPageIndex === bookPages.length - 1 && <span className="animate-pulse text-rpg-accent font-bold">...</span>}
                 </div>
               </div>
            </div>

            {/* Input Area */}
            <div className="p-8 bg-rpg-900 border-t border-rpg-700/50 flex-none">
               <div className="max-w-2xl mx-auto flex gap-4">
                 <textarea 
                    className="flex-1 bg-rpg-800/80 border border-rpg-700 rounded-3xl p-5 text-rpg-text h-16 resize-none focus:ring-2 focus:ring-rpg-accent outline-none transition-all placeholder:text-rpg-muted/40 font-serif text-lg" 
                    placeholder="描述你的行動..." 
                    value={inputMessage} 
                    onChange={(e) => setInputMessage(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendRPMessage()} 
                    disabled={gameState.isLoading}
                 />
                 <Button onClick={handleSendRPMessage} isLoading={gameState.isLoading} className="h-16 px-12 rounded-3xl font-bold text-lg">行動</Button>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Persistent Sidebar */}
      {!showSidebar && (
        <button onClick={() => setShowSidebar(true)} className="fixed right-0 top-1/2 -translate-y-1/2 bg-rpg-accent p-3 rounded-l-3xl text-rpg-900 z-40 shadow-2xl hover:translate-x-[-5px] transition-transform font-bold flex flex-col items-center gap-1">
          <span className="text-xl">👤</span>
          <span className="writing-vertical-rl text-[10px] tracking-widest">角色檔案</span>
        </button>
      )}
      <div className={`fixed inset-y-0 right-0 w-80 bg-rpg-900 border-l border-rpg-700/50 z-[120] shadow-2xl transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${showSidebar ? 'translate-x-0' : 'translate-x-full'} p-6 flex flex-col backdrop-blur-md bg-opacity-95`}>
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold text-rpg-accent tracking-widest uppercase italic border-b-2 border-rpg-accent/30 pb-1">Character Sheet</h3>
          <button onClick={() => setShowSidebar(false)} className="text-rpg-muted hover:text-white text-3xl transition-colors">✕</button>
        </div>

        <div className="flex flex-col gap-3 mb-8">
          <Button variant={gameState.viewMode === 'GM' ? 'primary' : 'secondary'} className="rounded-xl py-3 shadow-lg" onClick={() => updateState({ viewMode: 'GM' })}>切換至 GM 設計室</Button>
          <Button variant={gameState.viewMode === 'RP' ? 'primary' : 'secondary'} className="rounded-xl py-3 shadow-lg" disabled={!gameState.isGameStarted} onClick={() => updateState({ viewMode: 'RP' })}>返回冒險現場</Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 no-scrollbar pr-1">
           <div className="bg-gradient-to-br from-rpg-800 to-rpg-900 p-6 rounded-3xl border border-rpg-700 shadow-inner">
             <div className="text-[9px] text-rpg-muted uppercase tracking-[0.3em] mb-2 font-bold">Adventurer Dossier</div>
             <div className="text-2xl font-serif text-white mb-1 drop-shadow-md">{gameState.character.name}</div>
             <div className="text-sm text-rpg-accent font-bold tracking-tight">{gameState.character.race} · {gameState.character.class} <span className="text-white/40 ml-2">LEVEL {gameState.character.level}</span></div>
           </div>

           <div className="space-y-6">
             <div>
                <div className="flex justify-between text-xs font-black mb-2 uppercase tracking-widest text-red-400"><span>Vitality (HP)</span><span>{gameState.character.hp} / {gameState.character.maxHp}</span></div>
                <div className="h-3 bg-rpg-800 rounded-full border border-white/5 p-0.5"><div className="h-full bg-gradient-to-r from-red-700 to-red-400 rounded-full transition-all duration-1000" style={{width: `${(gameState.character.hp/gameState.character.maxHp)*100}%`}} /></div>
             </div>
             
             <div>
                <div className="flex justify-between text-xs font-black mb-2 uppercase tracking-widest text-blue-400"><span>Aether (MP)</span><span>{gameState.character.mp} / {gameState.character.maxMp}</span></div>
                <div className="h-3 bg-rpg-800 rounded-full border border-white/5 p-0.5"><div className="h-full bg-gradient-to-r from-blue-700 to-blue-400 rounded-full transition-all duration-1000" style={{width: `${(gameState.character.mp/gameState.character.maxMp)*100}%`}} /></div>
             </div>
           </div>

           <div className="grid grid-cols-2 gap-3">
             {Object.entries(gameState.character.attributes).map(([key, val]) => (
               <div key={key} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center hover:bg-white/10 transition-colors group">
                 <div className="text-[10px] text-rpg-muted mb-1 group-hover:text-rpg-accent transition-colors">{key}</div>
                 <div className="text-2xl font-mono text-rpg-accent font-black tracking-tighter">{val}</div>
               </div>
             ))}
           </div>

           <div>
             <div className="text-[10px] text-rpg-muted uppercase tracking-[0.3em] mb-3 font-bold">🎒 背包物品</div>
             <div className="flex flex-wrap gap-2">
               {gameState.character.inventory.map((item, idx) => (
                 <span key={idx} className="px-3 py-1.5 bg-rpg-700/40 text-[11px] rounded-xl border border-rpg-600 text-gray-300 shadow-sm">#{item}</span>
               ))}
               {gameState.character.inventory.length === 0 && <span className="text-xs text-rpg-muted italic opacity-30">口袋空空...</span>}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;
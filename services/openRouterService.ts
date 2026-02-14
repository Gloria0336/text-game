import { OpenRouterModel, Message } from '../types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

const getHeaders = (apiKey: string) => ({
  'Authorization': `Bearer ${apiKey.trim()}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost',
  'X-Title': 'Infinite Text Adventure',
});

export async function fetchModels(apiKey: string): Promise<OpenRouterModel[]> {
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost',
      'X-Title': 'Infinite Text Adventure',
    };

    const response = await fetch(`${OPENROUTER_API_URL}/models`, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch models: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data || !data.data) {
       return [];
    }

    return data.data
      .sort((a: any, b: any) => a.id.localeCompare(b.id))
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing: m.pricing
      }));
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
}

export async function generateCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature: number = 0.7,
  responseFormat?: 'json_object' | 'text'
): Promise<string> {
  // 針對 OpenAI o1/o3 系列模型進行優化（不支援 system role 與 temperature）
  const isReasoningModel = model.includes('o1-') || model.includes('o3-') || model.includes('reasoning');
  
  let processedMessages = [...messages];
  if (isReasoningModel) {
    // 將 system 訊息轉為 user 訊息
    processedMessages = messages.map(msg => 
      msg.role === 'system' ? { ...msg, role: 'user' as const } : msg
    );
  }

  const fetchWithFormat = async (format?: 'json_object') => {
    const body: any = {
      model: model,
      messages: processedMessages,
      max_tokens: 4000,
    };

    // 只有非推理模型才傳入 temperature
    if (!isReasoningModel) {
      body.temperature = temperature;
    }

    if (format === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.text();
      return { ok: false, status: response.status, error: errData };
    }

    const data = await response.json();
    return { ok: true, data };
  };

  try {
    // 嘗試請求
    let result = await fetchWithFormat(responseFormat === 'json_object' ? 'json_object' : undefined);

    // 如果 400 錯誤且原本請求 JSON 模式，嘗試降級為純文字模式（許多模型不支援 JSON 參數）
    if (!result.ok && result.status === 400 && responseFormat === 'json_object') {
      console.warn("Model does not support JSON mode, retrying with text format...");
      result = await fetchWithFormat();
    }

    if (!result.ok) {
      if (result.status === 401) throw new Error("API Key 無效或過期");
      if (result.status === 402) throw new Error("點數不足");
      throw new Error(`API Error: ${result.status} - ${result.error}`);
    }

    const choice = result.data.choices[0];
    let content = choice.message.content || '';
    
    // 擷取 OpenRouter 特有的推理內容 (Reasoning)
    // 如果 API 直接提供了 reasoning 欄位
    const reasoning = choice.message.reasoning;
    if (reasoning) {
      content = `<think>\n${reasoning}\n</think>\n${content}`;
    }

    return content;

  } catch (error) {
    console.error('Error generating completion:', error);
    throw error;
  }
}
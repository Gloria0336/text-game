import { Message, OpenRouterModel } from '../types';

const SITE_URL = 'http://localhost:3000'; // Replace with actual site URL in production
const SITE_NAME = 'Infinite Text Adventure';

export async function fetchModels(apiKey: string): Promise<OpenRouterModel[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('API Key cannot be empty');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanKey}`,
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_NAME,
      }
    });

    if (!response.ok) {
      let errorMsg = `Failed to fetch models (${response.status})`;
      try {
        const errorData = await response.json();
        // OpenRouter error format: { error: { message: "..." } }
        if (errorData.error?.message) {
          errorMsg = errorData.error.message;
        } else if (errorData.message) {
          errorMsg = errorData.message;
        }
      } catch (e) {
        // failed to parse json, use status text
        if (response.statusText) errorMsg += `: ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return data.data.map((m: any) => ({
      id: m.id,
      name: m.name || m.id
    })).sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));
  } catch (error: any) {
    console.error('Error fetching models:', error);
    throw error.message || error;
  }
}

export async function generateCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature: number = 0.7,
  responseFormat?: 'json_object' | 'text',
  tools?: any[]
): Promise<{ content: string, toolCalls?: any[] }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('API Key cannot be empty');
  }

  try {
    const payload: any = {
      model: model,
      messages: messages,
      temperature: temperature,
    };

    if (responseFormat) {
      payload.response_format = { type: responseFormat };
    }

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanKey}`,
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_NAME,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMsg = `API Request Failed (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMsg = errorData.error.message;
          // Handle specific OpenRouter codes if needed
          if (errorData.error.code) {
            errorMsg += ` (Code: ${errorData.error.code})`;
          }
        } else if (errorData.message) {
          errorMsg = errorData.message;
        }
      } catch (e) {
        if (response.statusText) errorMsg += `: ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('API returned no content choices.');
    }

    const message = data.choices[0]?.message;
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls
    };
  } catch (error: any) {
    console.error('Error generating completion:', error);
    throw error.message || error;
  }
}
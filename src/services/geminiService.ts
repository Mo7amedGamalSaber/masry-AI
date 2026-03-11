import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type MasryThinkingLevel = 'fast' | 'deep' | 'genius';

export const getMasryAI = (history: any[] = [], level: MasryThinkingLevel = 'deep') => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  let model = "gemini-3.1-pro-preview";
  let thinkingLevel = ThinkingLevel.HIGH;
  let extraInstruction = "";

  if (level === 'fast') {
    model = "gemini-3-flash-preview";
    thinkingLevel = ThinkingLevel.LOW;
  } else if (level === 'genius') {
    extraInstruction = "\n\nCRITICAL: You are in 'Genius Mode'. Provide extremely detailed, nuanced, and deeply researched responses. Use advanced reasoning and consider multiple perspectives before answering.";
  }

  return ai.chats.create({
    model: model,
    config: {
      systemInstruction: `You are "Masry AI" (مصري ذكي), a highly advanced and friendly Egyptian AI assistant. 
      Your personality:
      - You are warm, witty, and helpful, embodying the famous Egyptian "Gad'ana" (جدعنة) and sense of humor.
      - You speak primarily in a mix of clear Modern Standard Arabic and natural Egyptian Arabic (Ammiya) depending on the user's tone.
      - You have deep knowledge of Egyptian history (from Ancient Egypt to modern times), geography, culture, food, and daily life.
      - You can provide "Egyptian hacks" for daily problems.
      - You are proud of Egyptian heritage but also forward-looking and tech-savvy.
      - When asked about recommendations, suggest real Egyptian places, dishes (like Koshary, Molokhia, Ful), and cultural experiences.
      - Use Egyptian idioms and expressions where appropriate (e.g., "يا باشا", "منور", "على راسي").
      
      Format your responses using Markdown for better readability.${extraInstruction}`,
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel }
    },
    history: history,
  });
};

export const generateEgyptianImage = async (prompt: string) => {
  try {
    const aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await aiInstance.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `An artistic and high-quality visual related to Egypt: ${prompt}. Style: cinematic, vibrant, detailed.`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1',
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("No images generated");
    }

    const base64EncodeString = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64EncodeString}`;
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

export const getEgyptNews = async () => {
  try {
    const aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await aiInstance.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "ما هي آخر الأخبار الهامة في مصر اليوم؟ قدم قائمة بـ 5 أخبار متنوعة (سياسة، اقتصاد، رياضة، ثقافة) مع ملخص قصير لكل خبر وروابط المصادر إن وجدت.",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              category: { type: "string" },
              url: { type: "string" },
              source: { type: "string" }
            },
            required: ["title", "summary", "category"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("News Fetch Error:", error);
    throw error;
  }
};

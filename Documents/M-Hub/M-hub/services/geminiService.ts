import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { JobPosting } from "../types";

// Initialize Gemini Client
// In a real app, ensure API_KEY is handled securely via backend proxy or env vars.
const getApiKey = () => {
  try {
    return process.env.API_KEY || '';
  } catch (e) {
    return '';
  }
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export const getGeminiResponse = async (
  message: string,
  history: { role: string; parts: { text: string }[] }[] = []
): Promise<string> => {
  try {
    const model = 'gemini-3-flash-preview';
    
    // Using chat to maintain simple context history
    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: `You are "Sea Mate", an intelligent AI assistant specifically for Bangladeshi Mariners. 
        Your tone is professional, respectful, and helpful, often using nautical terms where appropriate.
        You have knowledge about maritime regulations (SOLAS, MARPOL, STCW), career progression in the merchant navy, and general shipboard life.
        You understand the specific context of Bangladeshi seafarers (Department of Shipping Bangladesh, CDC issuance, etc.).
        Keep answers concise and mobile-friendly.`,
      },
      history: history.map(h => ({
        role: h.role,
        parts: h.parts
      }))
    });

    const result: GenerateContentResponse = await chat.sendMessage({
      message: message
    });

    return result.text || "I'm having trouble connecting to the shore server right now. Please try again later.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Communication link unstable. Please check your connection and try again.";
  }
};

export interface ScannedDocumentData {
  documentName: string;
  expiryDate: string;
  documentNumber: string;
  category: string;
}

export const analyzeDocumentImage = async (base64Image: string): Promise<ScannedDocumentData> => {
  try {
    let mimeType = 'image/jpeg';
    let base64Data = base64Image;

    // Extract MIME type if present in data URL
    if (base64Image.includes(';base64,')) {
      const parts = base64Image.split(';base64,');
      mimeType = parts[0].replace('data:', '');
      base64Data = parts[1];
    }

    // Gemini Multimodal supports these types via inlineData
    const supportedMimeTypes = [
      'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 
      'application/pdf'
    ];

    // If file type is not supported for analysis (e.g. Word/Excel), return default empty data immediately
    // The UI will handle filling the name with the filename.
    if (!supportedMimeTypes.includes(mimeType)) {
      return {
        documentName: "",
        expiryDate: "",
        documentNumber: "",
        category: "Other"
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, 
              data: base64Data
            }
          },
          {
            text: "Analyze this maritime document. Extract the Document Title, Expiry Date (in YYYY-MM-DD format), Document Number, and Classify the Category (Certificate, License, Personal ID, Medical, Visa, Other). If a field is not found, use 'N/A'."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentName: { type: Type.STRING },
            expiryDate: { type: Type.STRING, description: "YYYY-MM-DD or N/A" },
            documentNumber: { type: Type.STRING },
            category: { 
              type: Type.STRING, 
              description: "One of: Certificate, License, Personal ID, Medical, Visa, Other" 
            }
          },
          required: ["documentName", "expiryDate", "documentNumber", "category"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ScannedDocumentData;
    }
    throw new Error("No data returned");
  } catch (error) {
    console.error("Document Analysis Error:", error);
    return {
      documentName: "",
      expiryDate: "",
      documentNumber: "",
      category: "Other"
    };
  }
};

export const parseJobPosting = async (text: string): Promise<Partial<JobPosting>> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract maritime job details from the following unstructured text (usually from WhatsApp/Telegram). 
      Return a JSON object.
      
      Text: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rank: { type: Type.STRING, description: "The rank required, e.g. Master, Chief Officer, Fitter" },
            shipType: { type: Type.STRING, description: "Type of vessel, e.g. Bulk Carrier, Tanker" },
            wage: { type: Type.STRING, description: "Salary or wages if mentioned" },
            joiningDate: { type: Type.STRING, description: "When is the joining" },
            description: { type: Type.STRING, description: "Short summary of the job" },
            contactInfo: { type: Type.STRING, description: "Email or Phone number found" },
            companyName: { type: Type.STRING, description: "Name of agency or company" }
          },
          required: ["rank", "shipType", "description", "contactInfo"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as Partial<JobPosting>;
    }
    throw new Error("Failed to parse job");
  } catch (error) {
    console.error("Job Parsing Error:", error);
    return {
      description: text,
      rank: "Unknown",
      shipType: "Unknown",
      contactInfo: "See description"
    };
  }
};
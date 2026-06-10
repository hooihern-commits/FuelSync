import { File } from 'expo-file-system';
import axios from 'axios';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`;

const NUTRITION_PROMPT = `You are a sports nutritionist AI. Analyze this food image and return ONLY a valid JSON object with no markdown, no explanation, no code fences. Use this exact format:
{
  "meal_name": "short description of the meal",
  "calories_kcal": 0,
  "carbs_g": 0,
  "protein_g": 0,
  "fat_g": 0,
  "confidence": "high"
}
Rules:
- Assume athlete-sized portions (active person, 70-80kg)
- hydration_ml: estimate only if there is a visible drink, otherwise return 0
- confidence: "high" if food is clearly visible, "medium" if partially obscured, "low" if unclear
- All numeric values must be numbers, not strings`;

export type FoodScanResult = {
  meal_name: string;
  calories_kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low';
};

export async function analyzeFoodPhoto(imageUri: string): Promise<FoodScanResult> {
  const file = new File(imageUri);
  const base64 = await file.base64();

  const response = await axios.post(GEMINI_URL, {
    contents: [{
      parts: [
        { text: NUTRITION_PROMPT },
        { inline_data: { mime_type: 'image/jpeg', data: base64 } }
      ]
    }]
  });

  const raw: string = response.data.candidates[0].content.parts[0].text;
  // Strip any accidental markdown fences just in case
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as FoodScanResult;
}
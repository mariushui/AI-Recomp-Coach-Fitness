
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";
import type { DailyCheckinData, Language, DietData, MacroAnalysis } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const EXERCISE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['strength', 'cardio'] },
    weight: { type: Type.STRING },
    weightType: { type: Type.STRING },
    sets: { type: Type.NUMBER },
    reps: { type: Type.NUMBER },
    duration: { type: Type.STRING },
    rpe: { type: Type.NUMBER },
    notes: { type: Type.STRING },
  },
  required: ["name", "type", "duration", "rpe", "notes"],
};

const JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metrics: {
      type: Type.OBJECT,
      properties: {
        weight: { type: Type.STRING },
        bodyFat: { type: Type.STRING },
      },
      required: ["weight", "bodyFat"],
    },
    diet: {
      type: Type.OBJECT,
      properties: {
        hydration: { type: Type.STRING },
        supplements: { type: Type.STRING },
        breakfast: { type: Type.STRING },
        lunch: { type: Type.STRING },
        snacks: { type: Type.STRING },
        dinner: { type: Type.STRING },
      },
      required: ["hydration", "supplements", "breakfast", "lunch", "snacks", "dinner"],
    },
    training: {
      type: Type.OBJECT,
      properties: {
        trained: { type: Type.BOOLEAN },
        type: { type: Type.STRING },
        rpe: { type: Type.NUMBER },
        exercises: {
          type: Type.ARRAY,
          items: EXERCISE_SCHEMA
        }
      },
      required: ["trained", "type", "rpe", "exercises"],
    },
    recovery: {
      type: Type.OBJECT,
      properties: {
        general: { type: Type.NUMBER },
        muscleSoreness: { type: Type.NUMBER },
        jointPain: { type: Type.NUMBER },
        sleepQuality: { type: Type.NUMBER },
        mood: { type: Type.NUMBER },
        appetite: { type: Type.NUMBER },
        concentration: { type: Type.NUMBER },
        emotion: { type: Type.STRING },
      },
      required: ["general", "muscleSoreness", "jointPain", "sleepQuality", "mood", "appetite", "concentration", "emotion"],
    },
    planning: {
      type: Type.OBJECT,
      properties: {
        activity: { type: Type.STRING },
        duration: { type: Type.STRING },
        focus: { type: Type.STRING },
      },
      required: ["activity", "duration", "focus"],
    },
    remarks: { type: Type.STRING }
  },
  required: ["metrics", "diet", "training", "recovery", "planning", "remarks"],
};

export const updateCheckinDataTool: FunctionDeclaration = {
  name: 'updateCheckinData',
  parameters: JSON_SCHEMA,
};

export const parseHealthData = async (rawText: string): Promise<DailyCheckinData> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Extract all health, workout, and diet info for body recomposition analysis.
IMPORTANT for exercises:
- Identify if it's 'strength' or 'cardio'.
- For all exercises, extract 'duration' and 'rpe'.
- For strength: also extract weight, sets, reps.

IMPORTANT for recovery:
- Extract 'emotion' as a descriptive string.
- Extract 'concentration' and 'appetite' as integers (1-10).

TEXT: ${rawText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: JSON_SCHEMA
    }
  });

  return JSON.parse(response.text || '{}');
};

export const estimateMacros = async (diet: DietData): Promise<MacroAnalysis> => {
  const dietSummary = `
    Breakfast: ${diet.breakfast}
    Lunch: ${diet.lunch}
    Dinner: ${diet.dinner}
    Snacks: ${diet.snacks}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Estimate the macronutrients for the following day of eating. Be conservative. 
    Focus on protein accuracy for body recomposition.
    
    MEALS: ${dietSummary}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          confidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
          notes: { type: Type.STRING }
        },
        required: ["calories", "protein", "carbs", "fat", "confidence", "notes"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

function formatPrompt(data: DailyCheckinData, lang: Language, history: any[], userBio: string): string {
  const historyText = history.length > 0 ? 
    `LONG-TERM DATABASE (Last 30 entries):\n${history.slice(-30).map(h => `${h.date}: Wt ${h.metrics?.weight}kg, BF ${h.metrics?.bodyFat}%, Ex: ${h.training.exercises.map((e: any) => `${e.name}(${e.weight || e.duration})`).join(', ')}`).join('\n')}` : 
    "No history database available yet. This is the first entry.";

  const exercisesText = data.training.exercises.map(ex => {
    if (ex.type === 'strength') {
      return `${ex.name} (Strength): ${ex.weight}${ex.weightType}, ${ex.sets}x${ex.reps}, Duration: ${ex.duration}min, RPE: ${ex.rpe}`;
    }
    return `${ex.name} (Cardio): Duration: ${ex.duration}min, RPE: ${ex.rpe}`;
  }).join('; ');

  return `
PERMANENT USER KNOWLEDGE (BIO):
${userBio || "No permanent bio data provided."}

CURRENT CHECK-IN (TODAY):
Weight: ${data.metrics.weight}kg, BF%: ${data.metrics.bodyFat}%
Hydration: ${data.diet.hydration}L
Diet: ${data.diet.breakfast} / ${data.diet.lunch} / ${data.diet.dinner}
Training: ${data.training.type} (Overall RPE: ${data.training.rpe})
Exercises: ${exercisesText}
Recovery: Sleep ${data.recovery.sleepQuality}/10, Mood ${data.recovery.mood}/10, Concentration/Focus: ${data.recovery.concentration}/10, Appetite: ${data.recovery.appetite}/10, Emotion: ${data.recovery.emotion}

${historyText}
`;
}

export const getCoachingAdvice = async (data: DailyCheckinData, lang: Language, history: any[] = [], userBio: string = ""): Promise<string> => {
  const systemInstruction = lang === 'de' 
    ? `Du bist der 'Body Recomp Database Analyst'. Deine Mission: Analysiere den heutigen Check-in im Kontext der gesamten HISTORIE-DATENBANK und dem PERMANENTEN USER-WISSEN. 
       VALIDIERUNGSREGELN:
       1. Datenbank-Analyse: Scanne die letzten 30 Einträge. Erkenne Trends bei Gewicht, Körperfett und Kraftwerten.
       2. Recomp-Status: Wenn Kraftwerte steigen (Progression) und Körpergewicht stabil oder sinkend ist -> Markiere als [VALIDIERT].
       3. Plateau-Check: Wenn sich seit 7 Tagen nichts bewegt, gib konkrete Datenbank-basierte Tipps.
       4. BIO-CHECK: Berücksichtige das permanente Wissen des Users (Verletzungen, Vorlieben) bei deinen Tipps.
       5. Sei technisch, präzise und datengetrieben. Nutze Markdown. Beginne immer mit Status: [VALIDIERT] oder [STAGNATION].`
    : `You are the 'Body Recomp Database Analyst'. Mission: Analyze today's check-in in the context of the entire HISTORY DATABASE and PERMANENT USER KNOWLEDGE.
       VALIDATION RULES:
       1. Database Analysis: Scan the last 30 entries. Identify trends in weight, body fat, and strength.
       2. Recomp Status: If strength increases (progression) and bodyweight is stable or decreasing -> Mark as [VALIDATED].
       3. Plateau Check: If nothing has moved for 7 days, provide specific database-driven tips.
       4. BIO-CHECK: Always respect permanent user knowledge (injuries, dietary preferences) when giving advice.
       5. Be technical, precise, and data-driven. Use Markdown. Always start with Status: [VALIDATED] or [STAGNATION].`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: formatPrompt(data, lang, history, userBio),
    config: { systemInstruction }
  });
  
  return response.text || '';
};


import type { Translations } from '../types';

export const translations: Translations = {
  // Header
  appTitle: { en: 'AI Recomp Coach', de: 'KI Recomp Coach' },
  appSubtitle: { en: 'Body Recomposition & Strength Tracking', de: 'Körper-Recomposition & Kraft-Tracking' },
  namePlaceholder: { en: 'Your Name', de: 'Dein Name' },
  
  // Macros
  macroAnalysis: { en: 'Macro Estimation', de: 'Makronährstoff-Schätzung' },
  calories: { en: 'Calories', de: 'Kalorien' },
  protein: { en: 'Protein', de: 'Eiweiß' },
  carbs: { en: 'Carbs', de: 'Kohlenhydrate' },
  fat: { en: 'Fat', de: 'Fett' },
  macroDisclaimer: { en: 'AI-generated estimation based on descriptions.', de: 'KI-generierte Schätzung basierend auf Beschreibungen.' },

  // Form Sections
  dailyCheckin: { en: 'Daily Check-in', de: 'Täglicher Check-in' },
  bodyMetrics: { en: 'Body Metrics', de: 'Körperwerte' },
  diet: { en: 'Diet', de: 'Ernährung' },
  training: { en: 'Training', de: 'Training' },
  recovery: { en: 'Recovery', de: 'Recovery' },
  planning: { en: 'Planning for Tomorrow', de: 'Planung für Morgen' },
  workoutLog: { en: 'Workout Log', de: 'Trainingsprotokoll' },
  
  // Metrics Fields
  weightLabel: { en: 'Weight (kg)', de: 'Gewicht (kg)' },
  bodyFatLabel: { en: 'Body Fat (%)', de: 'Körperfett (%)' },

  // Diet Fields
  hydration: { en: 'Hydration (L)', de: 'Flüssigkeitszufuhr (L)' },
  supplements: { en: 'Supplements', de: 'Nahrungsergänzung' },
  breakfast: { en: 'Breakfast', de: 'Frühstück' },
  lunch: { en: 'Lunch', de: 'Mittagessen' },
  snacks: { en: 'Snacks', de: 'Snacks' },
  dinner: { en: 'Dinner', de: 'Abendessen' },
  
  // Training Fields
  didYouTrain: { en: 'Did you train?', de: 'Hast du trainiert?' },
  yes: { en: 'Yes', de: 'Ja' },
  no: { en: 'No', de: 'Nein' },
  trainingType: { en: 'Main Focus', de: 'Hauptfokus' },
  rpe: { en: 'RPE (1-10)', de: 'RPE (1-10)' },

  // Exercise Fields
  exerciseName: { en: 'Exercise Name', de: 'Übung' },
  exerciseType: { en: 'Type', de: 'Typ' },
  strength: { en: 'Strength', de: 'Kraft' },
  cardio: { en: 'Cardio/Other', de: 'Cardio/Sonstiges' },
  weight: { en: 'Weight', de: 'Gewicht' },
  weightType: { en: 'Unit/Equipment', de: 'Einheit/Gerät' },
  sets: { en: 'Sets', de: 'Sätze' },
  reps: { en: 'Reps', de: 'Wdh.' },
  durationLabel: { en: 'Duration (min)', de: 'Dauer (Min.)' },
  exerciseRpe: { en: 'Ex. RPE', de: 'Üb. RPE' },
  addExercise: { en: 'Add Exercise', de: 'Übung hinzufügen' },
  removeExercise: { en: 'Remove', de: 'Entfernen' },

  // Recovery Fields
  generalRecovery: { en: 'General Recovery', de: 'Allgemeine Erholung' },
  muscleSoreness: { en: 'Muscle Soreness', de: 'Muskelkater' },
  jointTendonPain: { en: 'Joint/Tendon Pain', de: 'Gelenk-/Sehnenschmerzen' },
  sleepQuality: { en: 'Sleep Quality', de: 'Schlafqualität' },
  mood: { en: 'Mood', de: 'Stimmung' },
  concentration: { en: 'Focus & Concentration', de: 'Fokus & Konzentration' },
  appetite: { en: 'Appetite', de: 'Appetit' },
  emotion: { en: 'Emotion of the Day', de: 'Emotion des Tages' },

  // Planning Fields
  plannedActivity: { en: 'Planned Activity', de: 'Geplante Aktivität' },
  estimatedDuration: { en: 'Estimated Duration', de: 'Geschätzte Dauer' },
  goalFocus: { en: 'Goal/Focus', de: 'Ziel/Fokus' },

  // General
  remarks: { en: 'Remarks', de: 'Bemerkung' },
  submitButton: { en: 'Analyze & Validate Progress', de: 'Fortschritt analysieren & validieren' },
  exportHealth: { en: 'Export to iPhone Health', de: 'Export für iPhone Health' },
  copied: { en: 'Copied to Clipboard!', de: 'In Zwischenablage kopiert!' },

  // Calendar
  calendarTab: { en: 'Calendar Logs', de: 'Kalender-Logs' },
  noLogForDate: { en: 'No check-in for this date.', de: 'Kein Check-in für dieses Datum.' },
  selectDatePrompt: { en: 'Select a date to view history', de: 'Wähle ein Datum für die Historie' },
  backfillCall: { en: 'Backfill via Call', de: 'Nachtragen per Call' },

  // AI Response
  coachResponse: { en: 'Validation & Analysis', de: 'Validierung & Analyse' },
  loadingMessage: { en: 'Validating Recomposition Progress...', de: 'Recomposition-Fortschritt wird validiert...' },
  errorMessage: { en: 'An error occurred. Please try again.', de: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.' },
  introMessage: { 
    en: 'Fill out your check-in to see your Body Recomposition validation.',
    de: 'Fülle den Check-in aus, um deine Recomposition-Validierung zu sehen.'
  },

  // Smart Sync
  smartSyncTitle: { en: 'Smart Sync', de: 'Smart Sync' },
  smartSyncDesc: { 
    en: 'Paste health data or use Voice to autofill.', 
    de: 'Gesundheitsdaten einfügen oder Sprache nutzen.' 
  },
  syncButton: { en: 'Analyze Text', de: 'Text analysieren' },
  syncing: { en: 'Processing...', de: 'Verarbeitung...' },
  syncSuccess: { en: 'Import successful!', de: 'Import erfolgreich!' },

  // Voice Call
  voiceTitle: { en: 'Live Coach Call', de: 'Live Coach Call' },
  voiceSubtitle: { 
    en: 'Start a conversation to log your day.', 
    de: 'Starte ein Gespräch, um deinen Tag zu loggen.' 
  },
  startCall: { en: 'Start Check-in Call', de: 'Check-in Call starten' },
  endCall: { en: 'End Call', de: 'Anruf beenden' },
  coachListening: { en: 'Listening...', de: 'Coach hört zu...' },
  coachSpeaking: { en: 'Coach speaking...', de: 'Coach spricht...' },
};

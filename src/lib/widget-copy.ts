/**
 * Everything the widget says on its own behalf, in the languages the
 * assistant speaks. The network is German-first: a visitor who has not said a
 * word yet must be greeted in German, not in English, so German is both the
 * default and the fallback for anything a translation is missing.
 */
export type WidgetCopy = {
  subtitle: string;
  speaking: string;
  listening: string;
  voiceCall: string;
  endCall: string;
  placeholder: string;
  send: string;
  disclaimer: string;
  voiceTag: string;
  voiceUnavailable: string;
  voiceDropped: string;
  notDelivered: string;
  quickReplies: [string, string, string];
  takeSlot: (when: string, doctor: string) => string;
};

const COPY: Record<string, WidgetCopy> = {
  de: {
    subtitle: "KI-Assistentin · online",
    speaking: "Spricht ...",
    listening: "Hört zu ...",
    voiceCall: "Sprachanruf",
    endCall: "Auflegen",
    placeholder: "Nachricht schreiben ...",
    send: "Senden",
    disclaimer: "KI-Assistentin — keine medizinische Beratung. Notfall: 112.",
    voiceTag: "sprache",
    voiceUnavailable: "Der Sprachanruf ist gerade nicht möglich. Schreiben Sie mir bitte hier.",
    voiceDropped: "Der Sprachanruf wurde wegen eines Verbindungsproblems beendet.",
    notDelivered: "Das ist nicht im Gespräch angekommen — sagen Sie es bitte laut.",
    quickReplies: [
      "Ich möchte einen Termin buchen",
      "Ich möchte meinen Termin verschieben oder absagen",
      "Welche Kliniken haben Sie?",
    ],
    takeSlot: (when, doctor) => `Ich nehme den Termin am ${when} bei ${doctor}.`,
  },
  en: {
    subtitle: "AI assistant · online",
    speaking: "Speaking ...",
    listening: "Listening ...",
    voiceCall: "Voice call",
    endCall: "End call",
    placeholder: "Type your message ...",
    send: "Send",
    disclaimer: "AI assistant — no medical advice. Emergencies: call 112.",
    voiceTag: "voice",
    voiceUnavailable: "Voice is not available right now. Please continue in chat.",
    voiceDropped: "The voice call ended because of a connection problem.",
    notDelivered: "That did not reach the call — please say it out loud instead.",
    quickReplies: [
      "I'd like to book an appointment",
      "I need to move or cancel my appointment",
      "Which clinics do you have?",
    ],
    takeSlot: (when, doctor) => `I'll take the slot on ${when} with ${doctor}.`,
  },
  fr: {
    subtitle: "Assistante IA · en ligne",
    speaking: "Parle ...",
    listening: "Écoute ...",
    voiceCall: "Appel vocal",
    endCall: "Raccrocher",
    placeholder: "Écrivez votre message ...",
    send: "Envoyer",
    disclaimer: "Assistante IA — aucun conseil médical. Urgences : 112.",
    voiceTag: "voix",
    voiceUnavailable: "L'appel vocal est indisponible pour le moment. Écrivez-moi ici.",
    voiceDropped: "L'appel vocal s'est terminé à cause d'un problème de connexion.",
    notDelivered: "Cela n'est pas arrivé dans l'appel — dites-le à voix haute.",
    quickReplies: [
      "Je voudrais prendre rendez-vous",
      "Je veux déplacer ou annuler mon rendez-vous",
      "Quelles cliniques avez-vous ?",
    ],
    takeSlot: (when, doctor) => `Je prends le rendez-vous du ${when} avec ${doctor}.`,
  },
  es: {
    subtitle: "Asistente de IA · en línea",
    speaking: "Hablando ...",
    listening: "Escuchando ...",
    voiceCall: "Llamada de voz",
    endCall: "Colgar",
    placeholder: "Escriba su mensaje ...",
    send: "Enviar",
    disclaimer: "Asistente de IA — sin consejo médico. Emergencias: 112.",
    voiceTag: "voz",
    voiceUnavailable: "La llamada de voz no está disponible ahora. Escríbame por aquí.",
    voiceDropped: "La llamada de voz terminó por un problema de conexión.",
    notDelivered: "Eso no llegó a la llamada — dígalo en voz alta, por favor.",
    quickReplies: [
      "Quiero pedir una cita",
      "Quiero cambiar o cancelar mi cita",
      "¿Qué clínicas tienen?",
    ],
    takeSlot: (when, doctor) => `Me quedo con la cita del ${when} con ${doctor}.`,
  },
  it: {
    subtitle: "Assistente IA · online",
    speaking: "Sta parlando ...",
    listening: "In ascolto ...",
    voiceCall: "Chiamata vocale",
    endCall: "Chiudi",
    placeholder: "Scriva il suo messaggio ...",
    send: "Invia",
    disclaimer: "Assistente IA — nessun consiglio medico. Emergenze: 112.",
    voiceTag: "voce",
    voiceUnavailable: "La chiamata vocale non è disponibile ora. Mi scriva pure qui.",
    voiceDropped: "La chiamata vocale è terminata per un problema di connessione.",
    notDelivered: "Non è arrivato nella chiamata — lo dica ad alta voce.",
    quickReplies: [
      "Vorrei prenotare un appuntamento",
      "Vorrei spostare o disdire il mio appuntamento",
      "Quali cliniche avete?",
    ],
    takeSlot: (when, doctor) => `Prendo l'appuntamento del ${when} con ${doctor}.`,
  },
  pl: {
    subtitle: "Asystentka AI · online",
    speaking: "Mówi ...",
    listening: "Słucham ...",
    voiceCall: "Rozmowa głosowa",
    endCall: "Zakończ",
    placeholder: "Napisz wiadomość ...",
    send: "Wyślij",
    disclaimer: "Asystentka AI — bez porad medycznych. Nagły wypadek: 112.",
    voiceTag: "głos",
    voiceUnavailable: "Rozmowa głosowa jest teraz niedostępna. Proszę napisać tutaj.",
    voiceDropped: "Rozmowa głosowa zakończyła się z powodu problemu z połączeniem.",
    notDelivered: "To nie dotarło do rozmowy — proszę powiedzieć na głos.",
    quickReplies: [
      "Chcę umówić wizytę",
      "Chcę przełożyć lub odwołać wizytę",
      "Jakie macie kliniki?",
    ],
    takeSlot: (when, doctor) => `Biorę termin ${when} u ${doctor}.`,
  },
};

export const DEFAULT_WIDGET_LANGUAGE = "de";

export function widgetCopy(language: string | null | undefined): WidgetCopy {
  return COPY[(language ?? DEFAULT_WIDGET_LANGUAGE).toLowerCase().split("-")[0]] ?? COPY.de;
}

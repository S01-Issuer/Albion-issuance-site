// MailerLite global types
declare global {
  interface Window {
    ml: (action: string, formId?: string, show?: boolean) => void;
  }
}

export {};
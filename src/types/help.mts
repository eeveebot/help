export interface HelpItemParam {
  param: string;
  required: boolean;
  descr: string;
}

export interface HelpItem {
  command: string;
  descr: string;
  params?: HelpItemParam[];
}

export interface HelpRegistration {
  from: string;
  help: HelpItem[];
  ttl?: number; // Time-to-live in milliseconds (optional)
}

interface HelpTimers {
  cleanupTimer: NodeJS.Timeout;
  reRegistrationTimer: NodeJS.Timeout;
}

export interface RegisteredHelp {
  from: string;
  help: HelpItem[];
  ttl: number; // Time-to-live in milliseconds
  registeredAt: number; // Timestamp when the help was registered
  expiresAt: number; // Timestamp when the help expires
  timers?: HelpTimers; // Timers for cleanup and re-registration
}

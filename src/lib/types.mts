'use strict';

/** Shape of the parsed NATS command.execute message data. */
export interface NatsCommandData {
  platform: string;
  network: string;
  instance: string;
  channel: string;
  user: string;
  text: string;
  trace: string;
  originalText: string;
  botNick: string;
  from?: string;
  nick?: string;
  userHost?: string;
  [key: string]: unknown;
}

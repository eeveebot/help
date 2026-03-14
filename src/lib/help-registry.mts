import { NatsClient, log } from '@eeveebot/libeevee';
import { HelpRegistration, RegisteredHelp } from '../types/help.mjs';

export class HelpRegistry {
  private helpItems: Map<string, RegisteredHelp> = new Map();
  private natsClient: InstanceType<typeof NatsClient> | null = null;

  constructor(natsClient?: InstanceType<typeof NatsClient>) {
    this.natsClient = natsClient || null;
  }

  // Cleanup-like method to clean up resources
  public destroy(): void {
    // Clear all help timers
    for (const help of this.helpItems.values()) {
      if (help.timers) {
        clearTimeout(help.timers.cleanupTimer);
        clearTimeout(help.timers.reRegistrationTimer);
      }
    }
    this.helpItems.clear();
  }

  /**
   * Prompt modules to re-register their help that is halfway through its TTL
   */
  private promptReRegistration(help: RegisteredHelp): void {
    if (!this.natsClient) {
      return;
    }

    // Emit to the general help update request channel
    void this.natsClient.publish('help.updateRequest', JSON.stringify({}));

    // Emit to the module-specific help update request channel
    const subject = `help.updateRequest.${help.from}`;
    void this.natsClient.publish(
      subject,
      JSON.stringify({
        from: help.from,
      })
    );

    log.debug('Prompted re-registration for help', {
      producer: 'help',
      from: help.from,
    });
  }

  registerHelp(registration: HelpRegistration): void {
    try {
      const now = Date.now();
      // Use provided TTL or default to 120000ms (2 minutes)
      const ttl = registration.ttl ?? 120000;

      // If help from this module already exists, clear its existing timers
      const existingHelp = this.helpItems.get(registration.from);
      if (existingHelp && existingHelp.timers) {
        clearTimeout(existingHelp.timers.cleanupTimer);
        clearTimeout(existingHelp.timers.reRegistrationTimer);
      }

      const registeredHelp: RegisteredHelp = {
        from: registration.from,
        help: registration.help,
        ttl: ttl,
        registeredAt: now,
        expiresAt: now + ttl,
      };

      // Set up individual timers for this help
      const cleanupTimer = setTimeout(() => {
        this.helpItems.delete(registration.from);
        log.info('Expired help removed', {
          producer: 'help',
          from: registration.from,
        });
      }, ttl);

      // Set up re-registration timer for halfway through TTL
      const reRegistrationTimer = setTimeout(() => {
        const help = this.helpItems.get(registration.from);
        if (help) {
          this.promptReRegistration(help);
        }
      }, ttl / 2);

      // Store timers in the help object
      registeredHelp.timers = {
        cleanupTimer,
        reRegistrationTimer,
      };

      this.helpItems.set(registration.from, registeredHelp);

      log.info('Registered help', {
        producer: 'help',
        from: registration.from,
        ttl: ttl,
        expiresAt: registeredHelp.expiresAt,
      });
    } catch (error) {
      log.error('Failed to register help', {
        producer: 'help',
        from: registration.from,
        errorMessage: (error as Error).message,
      });
    }
  }

  unregisterHelp(from: string): boolean {
    const help = this.helpItems.get(from);
    const result = this.helpItems.delete(from);

    // Clear timers for this help
    if (help && help.timers) {
      clearTimeout(help.timers.cleanupTimer);
      clearTimeout(help.timers.reRegistrationTimer);
    }

    if (result) {
      log.info('Unregistered help', {
        producer: 'help',
        from: from,
      });
    }
    return result;
  }

  getHelp(from: string): RegisteredHelp | undefined {
    return this.helpItems.get(from);
  }

  getAllHelp(): RegisteredHelp[] {
    return Array.from(this.helpItems.values());
  }

  getModuleNames(): string[] {
    return Array.from(this.helpItems.keys());
  }

  /**
   * Get all non-expired help items
   */
  getActiveHelp(): RegisteredHelp[] {
    return Array.from(this.helpItems.values()).filter((help) => {
      // Check if help has expired
      return Date.now() <= help.expiresAt;
    });
  }
}

import { log } from '@eeveebot/libeevee';
import { HelpRegistration, RegisteredHelp } from '../types/help.mjs';

export class HelpRegistry {
  private helpItems: Map<string, RegisteredHelp> = new Map();

  // Cleanup-like method to clean up resources
  public destroy(): void {
    this.helpItems.clear();
  }

  registerHelp(registration: HelpRegistration): void {
    try {
      const registeredHelp: RegisteredHelp = {
        from: registration.from,
        help: registration.help,
      };

      this.helpItems.set(registration.from, registeredHelp);

      log.info('Registered help', {
        producer: 'help',
        from: registration.from,
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
    const result = this.helpItems.delete(from);

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
   * Get all help items
   */
  getActiveHelp(): RegisteredHelp[] {
    return Array.from(this.helpItems.values());
  }
}

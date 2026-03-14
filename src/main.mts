'use strict';

// Help module
// provides help information for commands across the system

import fs from 'node:fs';
import yaml from 'js-yaml';
import { NatsClient, log } from '@eeveebot/libeevee';
import { HelpRegistry } from './lib/help-registry.mjs';
import { HelpRegistration } from './types/help.mjs';

// Record module startup time for uptime tracking
const moduleStartTime = Date.now();

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

// Initialize help registry
let helpRegistry: HelpRegistry | null = null;

// Help command UUID and display name
const helpCommandUUID = '4D8E2F5A-9C1B-4D3C-8E7F-1A2B3C4D5E6F';
const helpCommandDisplayName = 'help';

interface HelpConfig {
  // Define help configuration properties here as needed
  [key: string]: unknown;
}

interface RateLimitConfig {
  mode: 'enqueue' | 'drop';
  level: 'channel' | 'user' | 'global';
  limit: number;
  interval: string; // e.g., "30s", "1m", "5m"
}

/**
 * Load help configuration from YAML file
 * @returns Help configuration parsed from YAML file
 */
function loadHelpConfig(): HelpConfig {
  // Get the config file path from environment variable
  const configPath = process.env.MODULE_CONFIG_PATH;
  if (!configPath) {
    log.warn('MODULE_CONFIG_PATH not set, using default config', {
      producer: 'help',
    });
    return {};
  }

  try {
    // Read the YAML file
    const configFile = fs.readFileSync(configPath, 'utf8');

    // Parse the YAML content
    const config = yaml.load(configFile) as HelpConfig;

    log.info('Loaded help configuration', {
      producer: 'help',
      configPath,
    });

    return config;
  } catch (error) {
    log.error('Failed to load help configuration, using defaults', {
      producer: 'help',
      configPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

// Function to register the help command with the router
async function registerHelpCommand(): Promise<void> {
  // Default rate limit configuration
  const defaultRateLimit: RateLimitConfig = {
    mode: 'drop',
    level: 'user',
    limit: 10,
    interval: '1m',
  };

  const commandRegistration = {
    type: 'command.register',
    commandUUID: helpCommandUUID,
    commandDisplayName: helpCommandDisplayName,
    platform: '.*', // Match all platforms
    network: '.*', // Match all networks
    instance: '.*', // Match all instances
    channel: '.*', // Match all channels
    user: '.*', // Match all users
    regex: 'help', // Match help command with optional module name
    platformPrefixAllowed: true,
    ratelimit: defaultRateLimit,
  };

  try {
    await nats.publish('command.register', JSON.stringify(commandRegistration));
    log.info('Registered help command with router', {
      producer: 'help',
      ratelimit: defaultRateLimit,
    });
  } catch (error) {
    log.error('Failed to register help command', {
      producer: 'help',
      error: error,
    });
  }
}

//
// Do whatever teardown is necessary before calling common handler
process.on('SIGINT', () => {
  natsClients.forEach((natsClient) => {
    void natsClient.drain();
  });

  if (helpRegistry) {
    helpRegistry.destroy();
  }
});

process.on('SIGTERM', () => {
  natsClients.forEach((natsClient) => {
    void natsClient.drain();
  });

  if (helpRegistry) {
    helpRegistry.destroy();
  }
});

//
// Setup NATS connection

// Get host and token
const natsHost = process.env.NATS_HOST || false;
if (!natsHost) {
  const msg = 'environment variable NATS_HOST is not set.';
  throw new Error(msg);
}

const natsToken = process.env.NATS_TOKEN || false;
if (!natsToken) {
  const msg = 'environment variable NATS_TOKEN is not set.';
  throw new Error(msg);
}

const nats = new NatsClient({
  natsHost: natsHost as string,
  natsToken: natsToken as string,
});
natsClients.push(nats);
await nats.connect();

// Initialize help registry with NATS client
helpRegistry = new HelpRegistry(nats);

// Register help command with the router
await registerHelpCommand();

// Load configuration at startup
loadHelpConfig();

// Subscribe to help updates from other modules
const helpUpdateSub = nats.subscribe('help.update', (_subject, message) => {
  try {
    const data = JSON.parse(message.string()) as HelpRegistration;
    log.info('Received help.update message', {
      producer: 'help',
      from: data.from,
    });

    if (helpRegistry) {
      helpRegistry.registerHelp(data);
    }
  } catch (error) {
    log.error('Failed to process help.update message', {
      producer: 'help',
      error: error,
    });
  }
});
natsSubscriptions.push(helpUpdateSub);

// Subscribe to help update requests
const helpUpdateRequestSub = nats.subscribe('help.updateRequest', () => {
  try {
    log.info('Received help.updateRequest message', {
      producer: 'help',
    });

    // In a full implementation, this would trigger all modules to resend their help
    // For now, we just log the request
  } catch (error) {
    log.error('Failed to process help.updateRequest message', {
      producer: 'help',
      error: error,
    });
  }
});
natsSubscriptions.push(helpUpdateRequestSub);

// Subscribe to module-specific help update requests
const helpUpdateRequestModuleSub = nats.subscribe(
  'help.updateRequest.*',
  (subject) => {
    try {
      const moduleName = subject.split('.').pop();
      log.info('Received module-specific help.updateRequest message', {
        producer: 'help',
        module: moduleName,
      });

      // In a full implementation, this would trigger the specific module to resend its help
      // For now, we just log the request
    } catch (error) {
      log.error(
        'Failed to process module-specific help.updateRequest message',
        {
          producer: 'help',
          error: error,
        }
      );
    }
  }
);
natsSubscriptions.push(helpUpdateRequestModuleSub);

// Subscribe to help command execution messages
const helpCommandSub = nats.subscribe(
  `command.execute.${helpCommandUUID}`,
  (_subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for help', {
        producer: 'help',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Parse the module name from the command text
      const args = data.text.trim();
      const moduleName = args ? args.toLowerCase() : null;

      // Generate help response
      let helpResponse = '';

      if (helpRegistry) {
        if (moduleName) {
          // Get help for specific module
          const moduleHelp = helpRegistry.getHelp(moduleName);
          if (moduleHelp) {
            helpResponse = `Help for \`${moduleName}\`:\n`;
            moduleHelp.help.forEach((item) => {
              helpResponse += `- \`${item.command}\`: ${item.descr}`;
              if (item.params && item.params.length > 0) {
                helpResponse += `\n  Parameters:`;
                item.params.forEach((param) => {
                  const required = param.required ? '(required)' : '(optional)';
                  helpResponse += `\n    - ${param.param} ${required}: ${param.descr}`;
                });
              }
              helpResponse += '\n';
            });
          } else {
            helpResponse = `No help found for module \`${moduleName}\`.`;
          }
        } else {
          // Get help for all modules
          const allHelp = helpRegistry.getActiveHelp();
          if (allHelp.length > 0) {
            helpResponse = 'Available modules with help:\n';
            allHelp.forEach((help) => {
              helpResponse += `- ${help.from}\n`;
            });
            helpResponse +=
              '\nUse `help <module>` to get help for a specific module.';
          } else {
            helpResponse = 'No help available at this time.';
          }
        }
      } else {
        helpResponse = 'Help system is not available.';
      }

      // Send response
      const response = {
        channel: data.channel,
        network: data.network,
        instance: data.instance,
        platform: data.platform,
        text: helpResponse,
        trace: data.trace,
        type: 'message.outgoing',
      };

      const outgoingTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(outgoingTopic, JSON.stringify(response));
    } catch (error) {
      log.error('Failed to process help command', {
        producer: 'help',
        error: error,
      });
    }
  }
);
natsSubscriptions.push(helpCommandSub);

// Subscribe to control messages for re-registering the help command
const controlSubRegisterCommandHelp = nats.subscribe(
  `control.registerCommands.${helpCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${helpCommandDisplayName} control message`,
      {
        producer: 'help',
      }
    );
    void registerHelpCommand();
  }
);
natsSubscriptions.push(controlSubRegisterCommandHelp);

const controlSubRegisterCommandAll = nats.subscribe(
  'control.registerCommands',
  () => {
    log.info('Received control.registerCommands control message', {
      producer: 'help',
    });
    void registerHelpCommand();
  }
);
natsSubscriptions.push(controlSubRegisterCommandAll);

// Subscribe to stats.uptime messages and respond with module uptime
const statsUptimeSub = nats.subscribe('stats.uptime', (_subject, message) => {
  try {
    const data = JSON.parse(message.string());
    log.info('Received stats.uptime request', {
      producer: 'help',
      replyChannel: data.replyChannel,
    });

    // Calculate uptime in milliseconds
    const uptime = Date.now() - moduleStartTime;

    // Send uptime back via the ephemeral reply channel
    const uptimeResponse = {
      module: 'help',
      uptime: uptime,
      uptimeFormatted: `${Math.floor(uptime / 86400000)}d ${Math.floor((uptime % 86400000) / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m ${Math.floor((uptime % 60000) / 1000)}s`,
    };

    if (data.replyChannel) {
      void nats.publish(data.replyChannel, JSON.stringify(uptimeResponse));
    }
  } catch (error) {
    log.error('Failed to process stats.uptime request', {
      producer: 'help',
      error: error,
    });
  }
});
natsSubscriptions.push(statsUptimeSub);

log.info('Help module initialized', {
  producer: 'help',
});

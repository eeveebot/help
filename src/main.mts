'use strict';

// Help module
// provides help information for commands across the system

import type { NatsCommandData } from './lib/types.mjs';
import * as Nats from 'nats';
import fs from 'node:fs';

import {
  NatsClient,
  log,
  createNatsConnection,
  registerGracefulShutdown,
  createModuleMetrics,
  loadModuleConfig,
  RateLimitConfig,
  defaultRateLimit,
  initializeSystemMetrics,
  setupHttpServer,
  registerCommand,
  sendChatMessage,
  registerStatsHandlers
} from '@eeveebot/libeevee';
import { HelpRegistry } from './lib/help-registry.mjs';
import { HelpRegistration, HelpRemoval } from './types/help.mjs';

// Import module-specific metrics
import {
  recordHelpCommand,
  recordBotsCommand,
  recordHelpRegistryOperation,
  recordProcessingTime,
  recordError,
} from './lib/metrics.mjs';

const metrics = createModuleMetrics('help');

// Record module startup time for uptime tracking
const moduleStartTime = Date.now();
const moduleVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;

// Initialize system metrics
initializeSystemMetrics('help');



const natsClients: InstanceType<typeof NatsClient>[] = [];

// Setup HTTP server for metrics and health checks
setupHttpServer({
  port: process.env.HTTP_API_PORT || '9000',
  serviceName: 'help',
  natsClients: natsClients,
});
const natsSubscriptions: Array<Promise<Nats.Subscription | false>> = [];

// Initialize help registry
let helpRegistry: HelpRegistry | null = null;

// Help command UUID and display name
const helpCommandUUID = '4d8e2f5a-9c1b-4d3c-8e7f-1a2b3c4d5e6f';
const helpCommandDisplayName = 'help';

const botsRawCommandUUID = '8e43df99-8b28-4128-babb-25a81d368fce';
const botsWithPrefixCommandUUID = '88fe186d-e631-4e2e-a1c9-6978d732902f';
const botsCommandDisplayName = 'bots';

interface HelpConfig {
  ratelimit?: RateLimitConfig;
}

// Register commands using libeevee registerCommand helper
// registerCommand handles command.register publish + control.registerCommands subscriptions automatically

//
// Register graceful shutdown
registerGracefulShutdown(natsClients, async () => {
  if (helpRegistry) helpRegistry.destroy();
});

//
// Setup NATS connection
const nats = await createNatsConnection();
natsClients.push(nats);

// Load configuration at startup
const helpConfig = loadModuleConfig<HelpConfig>({});
const rateLimitConfig = helpConfig.ratelimit || defaultRateLimit;

// Initialize help registry
helpRegistry = new HelpRegistry();

// Register help command with the router
const helpCmdSubs = await registerCommand(nats, {
  commandUUID: helpCommandUUID,
  commandDisplayName: helpCommandDisplayName,
  regex: '^help\\s*',
  platformPrefixAllowed: true,
  nickPrefixAllowed: true,
  ratelimit: rateLimitConfig,
}, metrics);
natsSubscriptions.push(...helpCmdSubs);

// Register bots command (raw, no platform prefix)
const botsCmdSubs = await registerCommand(nats, {
  commandUUID: botsRawCommandUUID,
  commandDisplayName: botsCommandDisplayName,
  regex: '^[.!]bots\\s*$',
  platformPrefixAllowed: false,
  ratelimit: rateLimitConfig,
}, metrics);
natsSubscriptions.push(...botsCmdSubs);

// Register bots command (with platform prefix)
const botsWithPrefixCmdSubs = await registerCommand(nats, {
  commandUUID: botsWithPrefixCommandUUID,
  commandDisplayName: botsCommandDisplayName,
  regex: '^bots\\s*$',
  platformPrefixAllowed: true,
  ratelimit: rateLimitConfig,
}, metrics);
natsSubscriptions.push(...botsWithPrefixCmdSubs);

// Load configuration at startup

// Subscribe to help updates from other modules
const helpUpdateSub = nats.subscribe('help.update', (subject: string, message: Nats.Msg) => {
  metrics.recordNatsSubscribe(subject);
  const startTime = Date.now();
  try {
    const data = JSON.parse(message.string()) as HelpRegistration;
    log.info('Received help.update message', {
      producer: 'help',
      from: data.from,
    });

    if (helpRegistry) {
      helpRegistry.registerHelp(data);
      recordHelpRegistryOperation('register', 'success');
    }
  } catch (error) {
    log.error('Failed to process help.update message', {
      producer: 'help',
      error: error,
    });
    recordHelpRegistryOperation('register', 'error');
    recordError('help_update_process');
  } finally {
    const duration = Date.now() - startTime;
    recordProcessingTime(duration / 1000); // Convert to seconds
  }
});
natsSubscriptions.push(helpUpdateSub);

// Subscribe to help removal messages
const helpRemoveSub = nats.subscribe('help.remove', (subject: string, message: Nats.Msg) => {
  metrics.recordNatsSubscribe(subject);
  const startTime = Date.now();
  try {
    const data = JSON.parse(message.string()) as HelpRemoval;
    log.info('Received help.remove message', {
      producer: 'help',
      from: data.from,
    });

    if (helpRegistry) {
      helpRegistry.unregisterHelp(data.from);
      recordHelpRegistryOperation('unregister', 'success');
    }
  } catch (error) {
    log.error('Failed to process help.remove message', {
      producer: 'help',
      error: error,
    });
    recordHelpRegistryOperation('unregister', 'error');
    recordError('help_remove_process');
  } finally {
    const duration = Date.now() - startTime;
    recordProcessingTime(duration / 1000);
  }
});
natsSubscriptions.push(helpRemoveSub);

// Subscribe to help update requests
const helpUpdateRequestSub = nats.subscribe('help.updateRequest', (subject: string) => {
  metrics.recordNatsSubscribe(subject);
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
    recordError('help_update_request_process');
  }
});
natsSubscriptions.push(helpUpdateRequestSub);

// Subscribe to module-specific help update requests
const helpUpdateRequestModuleSub = nats.subscribe(
  'help.updateRequest.*',
  (subject) => {
    metrics.recordNatsSubscribe(subject);
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
      recordError('module_specific_help_update_request_process');
    }
  }
);
natsSubscriptions.push(helpUpdateRequestModuleSub);

// Subscribe to help command execution messages
const helpCommandSub = nats.subscribe(
  `command.execute.${helpCommandUUID}`,
  async (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    const startTime = Date.now();
      let data: NatsCommandData = {} as NatsCommandData;
      try {
        data = JSON.parse(message.string());
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
            helpResponse = `No help found for module '${moduleName}'.`;
          }
        } else {
          // Get help for all modules
          const allHelp = helpRegistry.getActiveHelp();
          if (allHelp.length > 0) {
            helpResponse = 'Available modules with help:\n';
            // Sort modules alphabetically by their name
            allHelp.sort((a, b) => a.from.localeCompare(b.from));
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
      await sendChatMessage(nats, {
        channel: data.channel,
        network: data.network,
        instance: data.instance,
        platform: data.platform,
        text: helpResponse,
        trace: data.trace,
      }, metrics);
      
      // Record successful command execution
      recordHelpCommand(data.platform, data.network, data.channel, 'success');
    } catch (error) {
      log.error('Failed to process help command', {
        producer: 'help',
        error: error,
      });
      
      // Record failed command execution
      recordHelpCommand(data.platform, data.network, data.channel, 'error');
      recordError('help_command_process');
    } finally {
      const duration = Date.now() - startTime;
      recordProcessingTime(duration / 1000); // Convert to seconds
    }
  }
);
natsSubscriptions.push(helpCommandSub);

// Subscribe to bots command execution messages (raw command without platform prefix)
const botsCommandSub = nats.subscribe(
  `command.execute.${botsRawCommandUUID}`,
  async (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    const startTime = Date.now();
      let data: NatsCommandData = {} as NatsCommandData;
      try {
        data = JSON.parse(message.string());
      log.info('Received command.execute for bots', {
        producer: 'help',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Generate bots response with maintainer and URL
      const botNick = data.botNick || 'eevee';
      const botsResponse = `maintainer: goos | url: https://eevee.bot | help: "${botNick}: help"`;

      // Send response
      await sendChatMessage(nats, {
        channel: data.channel,
        network: data.network,
        instance: data.instance,
        platform: data.platform,
        text: botsResponse,
        trace: data.trace,
      }, metrics);
      
      // Record successful command execution
      recordBotsCommand(data.platform, data.network, data.channel, 'success');
    } catch (error) {
      log.error('Failed to process bots command', {
        producer: 'help',
        error: error,
      });
      
      // Record failed command execution
      recordBotsCommand(data.platform, data.network, data.channel, 'error');
      recordError('bots_command_process');
    } finally {
      const duration = Date.now() - startTime;
      recordProcessingTime(duration / 1000); // Convert to seconds
    }
  }
);
natsSubscriptions.push(botsCommandSub);

// Subscribe to bots command execution messages (with platform prefix)
const botsWithPrefixCommandSub = nats.subscribe(
  `command.execute.${botsWithPrefixCommandUUID}`,
  async (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    const startTime = Date.now();
      let data: NatsCommandData = {} as NatsCommandData;
      try {
        data = JSON.parse(message.string());
      log.info('Received command.execute for bots with platform prefix', {
        producer: 'help',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Generate bots response with maintainer and URL
      const botNick = data.botNick || 'eevee';
      const botsResponse = `maintainer: goos | url: https://eevee.bot | help: "${botNick}: help"`;

      // Send response
      await sendChatMessage(nats, {
        channel: data.channel,
        network: data.network,
        instance: data.instance,
        platform: data.platform,
        text: botsResponse,
        trace: data.trace,
      }, metrics);
      
      // Record successful command execution
      recordBotsCommand(data.platform, data.network, data.channel, 'success');
    } catch (error) {
      log.error('Failed to process bots command with platform prefix', {
        producer: 'help',
        error: error,
      });
      
      // Record failed command execution
      recordBotsCommand(data.platform, data.network, data.channel, 'error');
      recordError('bots_with_prefix_command_process');
    } finally {
      const duration = Date.now() - startTime;
      recordProcessingTime(duration / 1000); // Convert to seconds
    }
  }
);
natsSubscriptions.push(botsWithPrefixCommandSub);

// control.registerCommands subscriptions are now handled by registerCommand() autoControlSub

// Subscribe to stats.uptime and stats.emit.request
const statsSubs = registerStatsHandlers({ nats, moduleName: 'help', startTime: moduleStartTime, version: moduleVersion, metrics });
natsSubscriptions.push(...statsSubs);

// Request help updates from all modules at startup
try {
  await nats.publish('help.updateRequest', JSON.stringify({}));
  metrics.recordNatsPublish('help.updateRequest');
  log.info('Requested help updates from all modules at startup', {
    producer: 'help',
  });
} catch (error) {
  log.error('Failed to request help updates at startup', {
    producer: 'help',
    error: error,
  });
  metrics.recordNatsPublish('help.updateRequest');
  recordError('help_updates_request_at_startup');
}

log.info('Help module initialized', {
  producer: 'help',
});

import { Counter, Histogram } from 'prom-client';
import { log } from '@eeveebot/libeevee';

// Create metrics for help command executions
export const helpCommandCounter = new Counter({
  name: 'help_command_total',
  help: 'Total number of help command executions',
  labelNames: ['platform', 'network', 'channel', 'status'],
});

// Create metrics for help command executions
export const botsCommandCounter = new Counter({
  name: 'bots_command_total',
  help: 'Total number of bots command executions',
  labelNames: ['platform', 'network', 'channel', 'status'],
});

// Create metrics for help registry operations
export const helpRegistryCounter = new Counter({
  name: 'help_registry_operations_total',
  help: 'Total number of help registry operations',
  labelNames: ['operation', 'status'],
});

// Create metrics for NATS operations
export const natsOperationsCounter = new Counter({
  name: 'help_nats_operations_total',
  help: 'Total number of NATS operations',
  labelNames: ['operation', 'subject', 'status'],
});

// Create metrics for processing time
export const processingTimeHistogram = new Histogram({
  name: 'help_processing_time_seconds',
  help: 'Processing time for help commands in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

// Create metrics for errors
export const errorCounter = new Counter({
  name: 'help_errors_total',
  help: 'Total number of errors in the help module',
  labelNames: ['type'],
});

/**
 * Record help command execution
 * @param platform Platform name
 * @param network Network name
 * @param channel Channel name
 * @param status Status of the command execution ('success' or 'error')
 */
export function recordHelpCommand(
  platform: string,
  network: string,
  channel: string,
  status: 'success' | 'error'
): void {
  try {
    helpCommandCounter.inc(
      { platform, network, channel, status },
      1
    );
  } catch (error) {
    log.error('Failed to record help command metric', {
      producer: 'help',
      error: error,
    });
  }
}

/**
 * Record bots command execution
 * @param platform Platform name
 * @param network Network name
 * @param channel Channel name
 * @param status Status of the command execution ('success' or 'error')
 */
export function recordBotsCommand(
  platform: string,
  network: string,
  channel: string,
  status: 'success' | 'error'
): void {
  try {
    botsCommandCounter.inc(
      { platform, network, channel, status },
      1
    );
  } catch (error) {
    log.error('Failed to record bots command metric', {
      producer: 'help',
      error: error,
    });
  }
}

/**
 * Record help registry operation
 * @param operation Operation type
 * @param status Status of the operation ('success' or 'error')
 */
export function recordHelpRegistryOperation(
  operation: string,
  status: 'success' | 'error'
): void {
  try {
    helpRegistryCounter.inc({ operation, status }, 1);
  } catch (error) {
    log.error('Failed to record help registry operation metric', {
      producer: 'help',
      error: error,
    });
  }
}

/**
 * Record NATS operation
 * @param operation Operation type (publish/subscribe)
 * @param subject NATS subject
 * @param status Status of the operation ('success' or 'error')
 */
export function recordNatsOperation(
  operation: string,
  subject: string,
  status: 'success' | 'error'
): void {
  try {
    natsOperationsCounter.inc({ operation, subject, status }, 1);
  } catch (error) {
    log.error('Failed to record NATS operation metric', {
      producer: 'help',
      error: error,
    });
  }
}

/**
 * Record processing time
 * @param duration Duration in seconds
 */
export function recordProcessingTime(duration: number): void {
  try {
    processingTimeHistogram.observe(duration);
  } catch (error) {
    log.error('Failed to record processing time metric', {
      producer: 'help',
      error: error,
    });
  }
}

/**
 * Record error
 * @param type Type of error
 */
export function recordError(type: string): void {
  try {
    errorCounter.inc({ type }, 1);
  } catch (error) {
    log.error('Failed to record error metric', {
      producer: 'help',
      error: error,
    });
  }
}
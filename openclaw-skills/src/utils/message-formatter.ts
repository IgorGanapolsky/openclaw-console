/**
 * Professional message formatter for OpenClaw
 * Matches the clean, action-oriented style with clear status indicators
 */

export type StatusIcon = '✅' | '❌' | '⏺' | '🔄' | '⚡' | '🎯';

export interface ActionItem {
  description: string;
  completed?: boolean;
  details?: string;
}

export interface MessageOptions {
  status: StatusIcon;
  title: string;
  items?: ActionItem[];
  summary?: string;
  nextStep?: string;
  urgent?: boolean;
}

export class MessageFormatter {
  static format(options: MessageOptions): string {
    const { status, title, items = [], summary, nextStep, urgent } = options;

    let message = '';

    // Status header
    const urgentPrefix = urgent ? '🚨 ' : '';
    message += `**${urgentPrefix}${status} ${title.toUpperCase()}**\n\n`;

    // Action items
    if (items.length > 0) {
      for (const item of items) {
        const icon = item.completed ? '✅' : '⏺';
        const details = item.details ? ` (${item.details})` : '';
        message += `- **${icon} ${item.description}**${details}\n`;
      }
      message += '\n';
    }

    // Summary
    if (summary) {
      message += `**⏺ ${summary}**\n\n`;
    }

    // Next step
    if (nextStep) {
      message += `Next: ${nextStep}\n`;
    }

    return message.trim();
  }

  static success(title: string, items: ActionItem[], nextStep?: string): string {
    return this.format({
      status: '✅',
      title,
      items,
      nextStep
    });
  }

  static inProgress(title: string, items: ActionItem[], summary?: string): string {
    return this.format({
      status: '⏺',
      title,
      items,
      summary
    });
  }

  static error(title: string, items: ActionItem[], nextStep?: string): string {
    return this.format({
      status: '❌',
      title,
      items,
      nextStep,
      urgent: true
    });
  }

  static processing(title: string, summary: string): string {
    return this.format({
      status: '🔄',
      title,
      summary
    });
  }

  static quick(title: string, summary: string): string {
    return this.format({
      status: '⚡',
      title,
      summary
    });
  }

  static target(title: string, items: ActionItem[]): string {
    return this.format({
      status: '🎯',
      title,
      items
    });
  }
}

// Convenience functions for common patterns
export const formatters = {
  deployment: (status: 'started' | 'completed' | 'failed', version: string, platform: string) => {
    const statusMap = {
      started: { icon: '⏺' as StatusIcon, verb: 'DEPLOYING' },
      completed: { icon: '✅' as StatusIcon, verb: 'DEPLOYED' },
      failed: { icon: '❌' as StatusIcon, verb: 'DEPLOYMENT FAILED' }
    };

    const { icon, verb } = statusMap[status];
    return MessageFormatter.format({
      status: icon,
      title: `${verb} ${platform.toUpperCase()}`,
      items: [
        { description: `Version ${version}`, completed: status === 'completed' },
        { description: 'TestFlight upload', completed: status === 'completed' },
        { description: 'Tester notification', completed: status === 'completed' }
      ]
    });
  },

  buildProgress: (step: string, total: number, current: number, details?: string) => {
    return MessageFormatter.processing(
      `BUILD STEP ${current}/${total}`,
      `${step}${details ? ` - ${details}` : ''}`
    );
  },

  approval: (action: string, risk: 'low' | 'medium' | 'high') => {
    const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' };
    return MessageFormatter.format({
      status: '🎯',
      title: 'APPROVAL REQUIRED',
      items: [
        { description: `Action: ${action}` },
        { description: `Risk Level: ${riskEmoji[risk]} ${risk.toUpperCase()}` }
      ],
      summary: 'Awaiting mobile approval to proceed'
    });
  },

  incident: (severity: 'critical' | 'warning' | 'info', title: string, details: string) => {
    const severityMap = {
      critical: { icon: '❌' as StatusIcon, emoji: '🚨' },
      warning: { icon: '⏺' as StatusIcon, emoji: '⚠️' },
      info: { icon: '✅' as StatusIcon, emoji: 'ℹ️' }
    };

    const { icon, emoji } = severityMap[severity];
    return MessageFormatter.format({
      status: icon,
      title: `${emoji} INCIDENT ${severity.toUpperCase()}`,
      items: [
        { description: title },
        { description: details }
      ],
      urgent: severity === 'critical'
    });
  }
};
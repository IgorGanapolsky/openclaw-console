/**
 * Trading Monitor Skill
 *
 * Simulates monitoring algorithmic trading strategies.
 * Creates incidents for anomalies detected in trading activity
 * and requests approval before executing significant trades.
 */

import { v4 as uuidv4 } from 'uuid';
import { TaskManagerSkill } from './task-manager.js';
import { IncidentManagerSkill } from './incident-manager.js';
import { ApprovalGateSkill } from './approval-gate.js';
import type { StateManager } from '../gateway/state.js';
import type { GatewayConfig } from '../config/default.js';

export interface TradingMonitorOptions {
  agentId: string;
  agentName: string;
  /** Trading symbols to monitor (e.g. ['BTC-USD', 'ETH-USD']) */
  symbols?: string[];
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
}

interface TradingAnomaly {
  symbol: string;
  type: 'price_spike' | 'volume_anomaly' | 'drawdown_breach' | 'strategy_drift';
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

interface ProposedTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  strategy: string;
  rationale: string;
}

/**
 * Monitors trading strategies and enforces approval gates for significant trades.
 */
export class TradingMonitorSkill {
  private taskManager: TaskManagerSkill;
  private incidentManager: IncidentManagerSkill;
  private approvalGate: ApprovalGateSkill;
  private options: Required<TradingMonitorOptions>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;

  constructor(state: StateManager, config: GatewayConfig, options: TradingMonitorOptions) {
    this.taskManager = new TaskManagerSkill(state);
    this.incidentManager = new IncidentManagerSkill(state);
    this.approvalGate = new ApprovalGateSkill(state, config);
    this.options = {
      symbols: ['BTC-USD', 'ETH-USD', 'AAPL', 'TSLA'],
      pollIntervalMs: 60_000,
      ...options,
    };
  }

  /** Start the monitoring loop. */
  public start(): void {
    console.info(`[trading-monitor] Starting monitor for ${this.options.symbols.join(', ')}`);
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, this.options.pollIntervalMs);
  }

  /** Stop the monitoring loop. */
  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      console.info('[trading-monitor] Stopped');
    }
  }

  // ── Simulated monitoring cycle ────────────────────────────────────────────

  private async tick(): Promise<void> {
    this.tickCount++;

    // Check for anomalies on each tick
    const anomalies = this.detectAnomalies();
    for (const anomaly of anomalies) {
      this.handleAnomaly(anomaly);
    }

    // Propose a trade every 3 ticks
    if (this.tickCount % 3 === 0) {
      const trade = this.generateProposedTrade();
      await this.executeTrade(trade);
    }
  }

  /** Simulate anomaly detection logic. */
  private detectAnomalies(): TradingAnomaly[] {
    const anomalies: TradingAnomaly[] = [];

    // Simulate occasional anomalies
    if (this.tickCount % 4 === 0) {
      const symbol = this.options.symbols[this.tickCount % this.options.symbols.length] ?? 'BTC-USD';
      anomalies.push({
        symbol,
        type: this.tickCount % 8 === 0 ? 'price_spike' : 'volume_anomaly',
        description: this.tickCount % 8 === 0
          ? `${symbol} price moved +12.4% in under 60 seconds — potential manipulation or news event`
          : `${symbol} trading volume 340% above 30-day average — unusual activity detected`,
        severity: this.tickCount % 8 === 0 ? 'critical' : 'warning',
      });
    }

    if (this.tickCount % 7 === 0) {
      anomalies.push({
        symbol: this.options.symbols[0] ?? 'BTC-USD',
        type: 'drawdown_breach',
        description: `Strategy "MeanRevert-v2" has breached the 5% maximum drawdown threshold`,
        severity: 'critical',
      });
    }

    return anomalies;
  }

  private handleAnomaly(anomaly: TradingAnomaly): void {
    console.info(`[trading-monitor] Anomaly detected: ${anomaly.type} on ${anomaly.symbol}`);

    void this.incidentManager.createIncident({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      severity: anomaly.severity,
      title: `Trading anomaly: ${anomaly.type.replace(/_/g, ' ')} on ${anomaly.symbol}`,
      description: anomaly.description,
      actions: ['ask_root_cause', 'propose_fix', 'acknowledge'],
    });
  }

  /** Simulate generating a proposed trade. */
  private generateProposedTrade(): ProposedTrade {
    const symbol = this.options.symbols[this.tickCount % this.options.symbols.length] ?? 'BTC-USD';
    const side: 'buy' | 'sell' = this.tickCount % 2 === 0 ? 'buy' : 'sell';
    const basePrice = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 2800 : 180;
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.01);
    const quantity = Math.round((100_000 / price) * 100) / 100;

    return {
      id: uuidv4(),
      symbol,
      side,
      quantity,
      price: Math.round(price * 100) / 100,
      strategy: 'MomentumBreakout-v3',
      rationale: `${side === 'buy' ? 'Bullish' : 'Bearish'} breakout signal confirmed by 3/5 indicators on ${symbol}`,
    };
  }

  /** Attempt to execute a proposed trade — requires approval for large orders. */
  private async executeTrade(trade: ProposedTrade): Promise<void> {
    const notionalValue = trade.quantity * trade.price;
    const needsApproval = notionalValue > 50_000; // Trades over $50k need human sign-off

    const task = await this.taskManager.createTask({
      agentId: this.options.agentId,
      title: `${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol} @ $${trade.price.toFixed(2)}`,
      description: `Strategy: ${trade.strategy} — ${trade.rationale}`,
      links: [
        {
          label: 'Trading Dashboard',
          url: `https://trading.internal/orders/${trade.id}`,
          type: 'dashboard',
        },
      ],
      initialStatus: 'running',
    });

    await this.taskManager.log(task.id, `Trade proposal: ${trade.side} ${trade.quantity} ${trade.symbol}`);
    await this.taskManager.log(task.id, `Notional value: $${notionalValue.toFixed(2)}`);
    await this.taskManager.log(task.id, `Strategy: ${trade.strategy}`);
    await this.taskManager.log(task.id, `Rationale: ${trade.rationale}`);

    if (needsApproval) {
      await this.taskManager.log(task.id, `Order exceeds $50,000 threshold — requesting human approval`, { requires_approval: true });

      const result = await this.approvalGate.requestApproval({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        actionType: 'trade_execution',
        title: `Approve trade: ${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol}`,
        description: [
          `Strategy "${trade.strategy}" is requesting execution of a large order.`,
          ``,
          `Symbol:   ${trade.symbol}`,
          `Side:     ${trade.side.toUpperCase()}`,
          `Quantity: ${trade.quantity}`,
          `Price:    $${trade.price.toFixed(2)}`,
          `Notional: $${notionalValue.toFixed(2)}`,
          ``,
          `Rationale: ${trade.rationale}`,
        ].join('\n'),
        command: `trade.execute({ id: "${trade.id}", symbol: "${trade.symbol}", side: "${trade.side}", qty: ${trade.quantity}, price: ${trade.price} })`,
        context: {
          service: 'trading-engine',
          environment: 'production',
          repository: 'myorg/trading-bot',
          riskLevel: 'critical',
        },
      });

      if (!result.approved) {
        await this.taskManager.log(task.id, result.timedOut ? 'Trade approval timed out — order cancelled' : 'Trade denied by operator — order cancelled');
        await this.taskManager.setStatus(task.id, 'done');
        return;
      }

      await this.taskManager.log(task.id, `Trade approved — submitting order`);
    }

    // Simulate order execution
    await this.taskManager.recordToolCall(task.id, 'trading_engine.submit_order', {
      trade_id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
    });

    // Simulate fill (80% success rate)
    if (Math.random() > 0.2) {
      await this.taskManager.complete(task.id, `Order filled: ${trade.side} ${trade.quantity} ${trade.symbol} @ $${trade.price.toFixed(2)}`);
    } else {
      await this.taskManager.recordError(task.id, `Order rejected by exchange: insufficient liquidity at $${trade.price.toFixed(2)}`);
      void this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'warning',
        title: `Trade execution failed: ${trade.symbol}`,
        description: `Order for ${trade.quantity} ${trade.symbol} was rejected by the exchange.`,
        actions: ['ask_root_cause', 'acknowledge'],
      });
    }
  }
}

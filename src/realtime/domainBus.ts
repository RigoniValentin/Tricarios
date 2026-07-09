import { EventEmitter } from "events";

/**
 * Bus de eventos de dominio (tipado).
 *
 * Desacopla la lógica de negocio del transporte (Socket.IO hoy, Redis/Kafka
 * a futuro). Los controladores emiten eventos de dominio; los `transports`
 * (ver `socketServer.ts`) los traducen a emisiones por su canal.
 *
 * No usar fuera de procesos de aplicación: NO es un broker distribuido.
 */

export interface CatalogStockChangedPayload {
  source: "rg-web" | "manual" | "pull";
  items: Array<{
    managementId: number;
    price: number;
    stockCount: number;
    inStock: boolean;
    name?: string;
  }>;
  report: {
    received: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  occurredAt: string;
}

export interface OrderCreatedPayload {
  externalOrderId: string;
  tiendaOrderId?: number;
  userId?: string;
  total?: number;
  status: "RECEIVED" | "DUPLICATE" | "SKIPPED" | "INVALID";
  occurredAt: string;
}

export interface DomainEventMap {
  "catalog.stockChanged": CatalogStockChangedPayload;
  "orders.created": OrderCreatedPayload;
}

class TypedDomainBus {
  private readonly emitter = new EventEmitter({ captureRejections: true });

  constructor() {
    this.emitter.setMaxListeners(50);
    this.emitter.on("error", (err) => {
      // Nunca debe tumbar el proceso por un listener fallido.
      console.error("[domainBus] listener error:", (err as Error)?.message ?? err);
    });
  }

  emit<K extends keyof DomainEventMap>(event: K, payload: DomainEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEventMap>(
    event: K,
    handler: (payload: DomainEventMap[K]) => void | Promise<void>
  ): void {
    this.emitter.on(event, (payload) => {
      try {
        const result = handler(payload as DomainEventMap[K]);
        if (result instanceof Promise) result.catch((err) => this.emitter.emit("error", err));
      } catch (err) {
        this.emitter.emit("error", err);
      }
    });
  }
}

export const domainBus = new TypedDomainBus();

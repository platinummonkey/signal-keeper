import { EventEmitter } from 'events';

export type AppEvent =
  | { type: 'poll:complete'; pollCount: number; prCount: number }
  | { type: 'pr:discovered'; owner: string; repo: string; number: number }
  | { type: 'review:complete'; prId: number; owner: string; repo: string; number: number; category: string }
  | { type: 'review:failed'; prId: number; owner: string; repo: string; number: number; error: string }
  | { type: 'approval:needed'; prId: number; owner: string; repo: string; number: number }
  | { type: 'ci:complete'; prId: number; owner: string; repo: string; number: number; status: string };

class AppEventBus extends EventEmitter {
  emit(event: 'app', data: AppEvent): boolean {
    return super.emit('app', data);
  }
  on(event: 'app', listener: (data: AppEvent) => void): this {
    return super.on('app', listener);
  }
}

export const eventBus = new AppEventBus();

import { create } from 'zustand';
import type { SwarmEvent } from '@swarm/shared/events';
import { initialState, reduce, tick, type DashboardState } from './reducer';
interface Store { state: DashboardState; dispatch: (event: SwarmEvent) => void; tick: (now: number) => void; reset: () => void }
export const useDashboard = create<Store>(set => ({ state: initialState(), dispatch: event => set(s => ({ state: reduce(s.state, event) })), tick: now => set(s => ({ state: tick(s.state, now) })), reset: () => set({ state: initialState() }) }));

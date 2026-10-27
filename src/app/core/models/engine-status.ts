/** Lo que el API Gateway sabe del motor de IA segun sus ultimas llamadas (`GET /engine/status`). */
export type EngineState = 'UNKNOWN' | 'UP' | 'DOWN';

export interface EngineStatusInfo {
  state: EngineState;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

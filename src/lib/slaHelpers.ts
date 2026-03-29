export type SLAStatus = 'GREEN' | 'YELLOW' | 'RED' | 'DISABLED';

export interface SLAResult {
  status: SLAStatus;
  label: string;
}

interface CalculateSLAParams {
  isSlaEnabled?: boolean;
  stageEnteredAt?: string | Date | null;
  limitMinutes?: number | null;
}

function formatTimeRemaining(ms: number): string {
  const absMs = Math.abs(ms);
  const minutes = Math.floor(absMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const prefix = ms < 0 ? 'Vencido hace ' : '';
  const suffix = ms >= 0 ? ' restante' : '';

  const seconds = Math.floor((absMs % 60000) / 1000);

  if (days > 0) return `${prefix}${days}d ${hours % 24}h${suffix}`;
  if (hours > 0) return `${prefix}${hours}h ${minutes % 60}m${suffix}`;
  return `${prefix}${minutes}m ${seconds}s${suffix}`;
}

export function calculateSLAStatus({ isSlaEnabled, stageEnteredAt, limitMinutes }: CalculateSLAParams): SLAResult {
  if (!isSlaEnabled || !stageEnteredAt || !limitMinutes) return { status: 'DISABLED', label: '' };

  const enteredAtDate = typeof stageEnteredAt === 'string'
    ? new Date(stageEnteredAt).getTime()
    : stageEnteredAt.getTime();

  if (isNaN(enteredAtDate)) return { status: 'DISABLED', label: '' };

  const now = Date.now();

  const limitMilliseconds = limitMinutes * 60 * 1000;
  const deadline = enteredAtDate + limitMilliseconds;
  const timeRemaining = deadline - now;

  if (timeRemaining <= 0) {
    return { status: 'RED', label: formatTimeRemaining(timeRemaining) };
  }

  const warningThreshold = limitMilliseconds * 0.20;
  if (timeRemaining <= warningThreshold) {
    return { status: 'YELLOW', label: formatTimeRemaining(timeRemaining) };
  }

  return { status: 'GREEN', label: formatTimeRemaining(timeRemaining) };
}

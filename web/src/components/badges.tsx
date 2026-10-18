import type { InvestmentStatus, NotificationStatus, YieldStatus } from '../api/types';
import { investmentStatusLabel, notificationStatusLabel, yieldStatusLabel } from '../lib/labels';
import { Badge } from './ui';

export function InvestmentStatusBadge({ status }: { status: InvestmentStatus }) {
  const tone = status === 'ACTIVE' ? 'ok' : status === 'MATURED' ? 'info' : status === 'CANCELLED' ? 'bad' : 'neutral';
  return <Badge tone={tone}>{investmentStatusLabel[status] ?? status}</Badge>;
}

export function YieldStatusBadge({ status }: { status: YieldStatus }) {
  const tone = status === 'CONFIRMED' ? 'ok' : status === 'REVERSED' ? 'bad' : 'neutral';
  return <Badge tone={tone}>{yieldStatusLabel[status] ?? status}</Badge>;
}

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  const tone = status === 'SENT' ? 'ok' : status === 'FAILED' ? 'bad' : 'warn';
  return <Badge tone={tone}>{notificationStatusLabel[status] ?? status}</Badge>;
}

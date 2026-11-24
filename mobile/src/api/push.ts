import { api } from './client';

export async function getPushPublicKey(): Promise<string | null> {
  const { data } = await api.get('/push/vapid-public');
  return data?.publicKey || null;
}

export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post('/push/subscribe', { subscription });
}

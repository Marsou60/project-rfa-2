import { api } from './client';
import { AdherentMapResponse } from '../map/types';

export async function getAdherentMap(): Promise<AdherentMapResponse> {
  const { data } = await api.get('/map/adherents');
  return data as AdherentMapResponse;
}

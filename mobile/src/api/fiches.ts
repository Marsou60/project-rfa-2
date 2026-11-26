import { api } from './client';

export type ClientFiche = {
  code_union?: string;
  nom_client?: string;
  groupe?: string;
  agent_union?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  telephone?: string;
  mail?: string;
  contact_magasin?: string;
  telephone_responsable?: string;
  contact_responsable_pdv?: string;
  missing_docs?: string[];
  drive_link?: string;
};

export type ClientNote = {
  id: number;
  code_union?: string;
  type_note?: string;
  note_simple: string;
  note_ia?: string | null;
  auteur?: string;
  created_at?: string;
};

export async function getClientFiche(codeUnion: string): Promise<ClientFiche | null> {
  try {
    const { data } = await api.get(`/nathalie/client/${encodeURIComponent(codeUnion)}`);
    return (data?.client || null) as ClientFiche | null;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function getClientNotes(codeUnion: string): Promise<ClientNote[]> {
  const { data } = await api.get(`/notes/client/${encodeURIComponent(codeUnion)}`);
  return (data?.notes || []) as ClientNote[];
}

export async function addClientNote(codeUnion: string, note: string, noteIa?: string | null): Promise<ClientNote> {
  const { data } = await api.post(`/notes/client/${encodeURIComponent(codeUnion)}`, {
    note_simple: note,
    note_ia: noteIa || undefined,
    type_note: 'NOTE SIMPLE',
  });
  return data as ClientNote;
}

export async function polishClientNote(note: string): Promise<string> {
  const { data } = await api.post('/notes/polish', { note }, { timeout: 45000 });
  return (data?.note_ia || '') as string;
}

export async function uploadClientDocument(
  codeUnion: string,
  kind: string,
  file: { uri?: string; name: string; type: string; file?: Blob },
): Promise<ClientFiche | null> {
  const form = new FormData();
  form.append('kind', kind);
  if (file.file) form.append('file', file.file);
  else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  }
  const { data } = await api.post(
    `/nathalie/client/${encodeURIComponent(codeUnion)}/document`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 },
  );
  return (data?.client || null) as ClientFiche | null;
}

export type OwnPiece = {
  kind: string;
  label: string;
  missing: boolean;
  status?: 'pending' | 'refused' | null;
  reason?: string | null;
};

export async function getMyDocuments(): Promise<OwnPiece[]> {
  const { data } = await api.get('/me/documents');
  return (data?.pieces || []) as OwnPiece[];
}

export async function submitMyDocument(kind: string, file: { uri?: string; name: string; type: string; file?: Blob }): Promise<void> {
  const form = new FormData();
  form.append('kind', kind);
  if (file.file) form.append('file', file.file);
  else form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  await api.post('/me/documents', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
}

export type PendingDocument = {
  file_id: string;
  kind: string;
  label?: string;
  status: string;
  reason?: string | null;
  link?: string | null;
};

export async function listPendingDocuments(codeUnion: string): Promise<PendingDocument[]> {
  const { data } = await api.get(`/nathalie/client/${encodeURIComponent(codeUnion)}/pending-documents`);
  return (data?.documents || []) as PendingDocument[];
}

export async function acceptPendingDocument(codeUnion: string, fileId: string): Promise<ClientFiche | null> {
  const { data } = await api.post(
    `/nathalie/client/${encodeURIComponent(codeUnion)}/pending-documents/${encodeURIComponent(fileId)}/accept`,
  );
  return (data?.client || null) as ClientFiche | null;
}

export async function refusePendingDocument(codeUnion: string, fileId: string, reason: string): Promise<void> {
  await api.post(
    `/nathalie/client/${encodeURIComponent(codeUnion)}/pending-documents/${encodeURIComponent(fileId)}/refuse`,
    { reason },
  );
}

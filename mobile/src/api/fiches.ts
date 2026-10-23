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

export async function addClientNote(codeUnion: string, note: string): Promise<ClientNote> {
  const { data } = await api.post(`/notes/client/${encodeURIComponent(codeUnion)}`, {
    note_simple: note,
    type_note: 'NOTE SIMPLE',
  });
  return data as ClientNote;
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

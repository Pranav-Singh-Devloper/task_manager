import { google, type drive_v3 } from 'googleapis';
import type { DriveClient, DriveFile, UploadInput } from '../types';
import { run, type LiveContext } from './call';

const FOLDER = 'application/vnd.google-apps.folder';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const FIELDS = 'id,name,mimeType,size,webViewLink,parents,appProperties,trashed,modifiedTime';

/** Escapes a value for a Drive query string. */
export function q(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** The Drive query that finds files carrying all of these appProperties. Works under drive.file. */
export function appPropertiesQuery(props: Record<string, string>): string {
  const clauses = Object.entries(props).map(
    ([k, v]) => `appProperties has { key=${q(k)} and value=${q(v)} }`,
  );
  return [...clauses, 'trashed = false'].join(' and ');
}

function toFile(f: drive_v3.Schema$File): DriveFile {
  return {
    id: f.id ?? '',
    name: f.name ?? '',
    mimeType: f.mimeType ?? '',
    size: f.size ? Number(f.size) : undefined,
    webViewLink: f.webViewLink ?? '',
    parents: f.parents ?? [],
    appProperties: (f.appProperties as Record<string, string> | null | undefined) ?? {},
    trashed: f.trashed ?? false,
    modifiedTime: f.modifiedTime ?? '',
  };
}

/** Drive v3 behind the DriveClient interface. Under drive.file it only ever sees files this app created. */
export class LiveDrive implements DriveClient {
  constructor(private readonly ctx: LiveContext) {}

  private async api(): Promise<drive_v3.Drive> {
    return google.drive({ version: 'v3', auth: await this.ctx.authClient() });
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const api = await this.api();
    return toFile((await run(this.ctx, () => api.files.get({ fileId, fields: FIELDS }))).data);
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.files.create({
        requestBody: { name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) },
        fields: FIELDS,
      }),
    );
    return toFile(res.data);
  }

  async ensureFolder(name: string, parentId?: string): Promise<DriveFile> {
    const api = await this.api();
    const query = [`mimeType = ${q(FOLDER)}`, `name = ${q(name)}`, 'trashed = false'];
    if (parentId) query.push(`${q(parentId)} in parents`);
    const res = await run(this.ctx, () =>
      api.files.list({
        q: query.join(' and '),
        fields: `files(${FIELDS})`,
        pageSize: 1,
        orderBy: 'createdTime',
      }),
    );
    const existing = res.data.files?.[0];
    return existing ? toFile(existing) : this.createFolder(name, parentId);
  }

  async createSpreadsheetFile(
    name: string,
    appProperties: Record<string, string>,
  ): Promise<DriveFile> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.files.create({ requestBody: { name, mimeType: SHEET, appProperties }, fields: FIELDS }),
    );
    return toFile(res.data);
  }

  async findByAppProperties(props: Record<string, string>): Promise<DriveFile[]> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.files.list({
        q: appPropertiesQuery(props),
        fields: `files(${FIELDS})`,
        orderBy: 'modifiedTime desc',
        pageSize: 100,
        spaces: 'drive',
      }),
    );
    return (res.data.files ?? []).map(toFile);
  }

  async uploadFile(input: UploadInput): Promise<DriveFile> {
    const api = await this.api();
    // The stream is passed through, never buffered whole in memory.
    const res = await run(this.ctx, () =>
      api.files.create({
        requestBody: {
          name: input.name,
          parents: [input.parentId],
          appProperties: input.appProperties,
        },
        media: { mimeType: input.mimeType, body: input.stream },
        fields: FIELDS,
      }),
    );
    return toFile(res.data);
  }

  async copyFile(
    fileId: string,
    name: string,
    parentId: string,
    appProperties: Record<string, string>,
  ): Promise<DriveFile> {
    const api = await this.api();
    // appProperties are always set explicitly so a backup is never mistaken for the database.
    const res = await run(this.ctx, () =>
      api.files.copy({
        fileId,
        requestBody: { name, parents: [parentId], appProperties },
        fields: FIELDS,
      }),
    );
    return toFile(res.data);
  }

  async setAppProperties(fileId: string, props: Record<string, string>): Promise<void> {
    const api = await this.api();
    await run(this.ctx, () => api.files.update({ fileId, requestBody: { appProperties: props } }));
  }

  async trashFile(fileId: string): Promise<void> {
    const api = await this.api();
    await run(this.ctx, () => api.files.update({ fileId, requestBody: { trashed: true } }));
  }
}

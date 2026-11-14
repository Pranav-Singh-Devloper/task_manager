import { GoogleApiError } from '../errors';
import type { DriveClient, DriveFile, UploadInput } from '../types';
import type { FailureInjector } from './failure';
import type { MockSpreadsheet, MockWorld } from './world';

const FOLDER = 'application/vnd.google-apps.folder';
const SHEET = 'application/vnd.google-apps.spreadsheet';

export class MockDrive implements DriveClient {
  constructor(
    private world: MockWorld,
    private failures: FailureInjector,
  ) {}

  private add(
    file: Omit<DriveFile, 'id' | 'webViewLink' | 'modifiedTime' | 'trashed'>,
    id?: string,
  ): DriveFile {
    const fileId = id ?? this.world.nextId('file');
    const created: DriveFile = {
      ...file,
      id: fileId,
      webViewLink: `https://drive.mock.local/file/${fileId}/view`,
      trashed: false,
      modifiedTime: new Date().toISOString(),
    };
    this.world.files.set(fileId, created);
    return created;
  }

  async getFile(fileId: string): Promise<DriveFile> {
    this.failures.check('network-only');
    const f = this.world.files.get(fileId);
    if (!f) throw new GoogleApiError(404, 'File not found.', 'notFound');
    return { ...f };
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    this.failures.check('drive');
    return this.add({
      name,
      mimeType: FOLDER,
      parents: parentId ? [parentId] : [],
      appProperties: {},
    });
  }

  async ensureFolder(name: string, parentId?: string): Promise<DriveFile> {
    this.failures.check('drive');
    const existing = [...this.world.files.values()].find(
      (f) =>
        f.mimeType === FOLDER &&
        !f.trashed &&
        f.name === name &&
        (parentId ? f.parents.includes(parentId) : true),
    );
    return existing ? { ...existing } : this.createFolder(name, parentId);
  }

  async createSpreadsheetFile(
    name: string,
    appProperties: Record<string, string>,
  ): Promise<DriveFile> {
    this.failures.check('network-only');
    const file = this.add({
      name,
      mimeType: SHEET,
      parents: [],
      appProperties: { ...appProperties },
    });
    const sheet: MockSpreadsheet = { id: file.id, tabs: new Map(), nextGid: 1 };
    // A new Google spreadsheet starts with one tab called "Sheet1" whose gid is 0.
    sheet.tabs.set(0, {
      gid: 0,
      title: 'Sheet1',
      rows: [],
      rowCount: 1000,
      columnCount: 26,
      format: {},
    });
    this.world.spreadsheets.set(file.id, sheet);
    return file;
  }

  async findByAppProperties(props: Record<string, string>): Promise<DriveFile[]> {
    this.failures.check('network-only');
    return [...this.world.files.values()]
      .filter(
        (f) => !f.trashed && Object.entries(props).every(([k, v]) => f.appProperties[k] === v),
      )
      .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
      .map((f) => ({ ...f }));
  }

  async uploadFile(input: UploadInput): Promise<DriveFile> {
    this.failures.check('drive');
    let size = 0;
    for await (const chunk of input.stream) size += (chunk as Buffer).length;
    return this.add({
      name: input.name,
      mimeType: input.mimeType,
      size,
      parents: [input.parentId],
      appProperties: { ...input.appProperties },
    });
  }

  async copyFile(
    fileId: string,
    name: string,
    parentId: string,
    appProperties: Record<string, string>,
  ): Promise<DriveFile> {
    this.failures.check('drive');
    const source = await this.getFile(fileId);
    const copy = this.add({
      ...source,
      name,
      parents: [parentId],
      appProperties: { ...appProperties },
    });
    const sheet = this.world.spreadsheets.get(fileId);
    if (sheet) {
      const tabs = new Map(
        [...sheet.tabs].map(([gid, t]) => [gid, { ...t, rows: t.rows.map((r) => [...r]) }]),
      );
      this.world.spreadsheets.set(copy.id, { id: copy.id, tabs, nextGid: sheet.nextGid });
    }
    return copy;
  }

  async setAppProperties(fileId: string, props: Record<string, string>): Promise<void> {
    this.failures.check('network-only');
    const f = this.world.files.get(fileId);
    if (!f) throw new GoogleApiError(404, 'File not found.', 'notFound');
    f.appProperties = { ...f.appProperties, ...props };
    f.modifiedTime = new Date().toISOString();
  }

  async trashFile(fileId: string): Promise<void> {
    this.failures.check('drive');
    const f = this.world.files.get(fileId);
    if (!f) throw new GoogleApiError(404, 'File not found.', 'notFound');
    f.trashed = true;
  }
}

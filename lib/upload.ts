import type { Meeting, MeetingFile } from '@/shared/meeting';
import { ApiError, NetworkError } from './api';

export interface UploadedFile extends MeetingFile {
  status: 'pending' | 'attached';
  meeting_id: string;
}

export interface UploadOptions {
  file: File;
  meetingId: string;
  category: string;
  /** For the file's name in Drive when the meeting is not saved yet. */
  date?: string;
  title?: string;
  /** Attach straight away: the meeting is saved and the person is on its page. */
  attach?: boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Sends one file to the server. fetch cannot report upload progress, so this uses XMLHttpRequest.
 * Throws ApiError (with the server's plain-language message) or NetworkError.
 */
export function uploadFile(
  o: UploadOptions,
): Promise<{ file: UploadedFile; meeting: Meeting | null }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // The server reads these before the file arrives, so they must be added first.
    form.append('meeting_id', o.meetingId);
    form.append('category', o.category);
    if (o.date) form.append('date', o.date);
    if (o.title) form.append('title', o.title);
    if (o.attach) form.append('attach', '1');
    form.append('file', o.file, o.file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.setRequestHeader('X-Requested-With', 'mm');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) o.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.onload = () => {
      type Body = {
        file?: UploadedFile;
        meeting?: Meeting | null;
        error?: { code?: string; message?: string; issues?: { message?: string }[] };
      };
      const data = ((): Body | null => {
        try {
          return JSON.parse(xhr.responseText) as Body;
        } catch {
          return null;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && data?.file) {
        resolve({ file: data.file, meeting: data.meeting ?? null });
        return;
      }
      reject(
        new ApiError(
          xhr.status,
          data?.error?.code ?? 'error',
          data?.error?.issues?.[0]?.message ??
            data?.error?.message ??
            'Something went wrong. Please try again.',
        ),
      );
    };
    xhr.send(form);
  });
}

/** "2.4 MB", "310 KB". */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

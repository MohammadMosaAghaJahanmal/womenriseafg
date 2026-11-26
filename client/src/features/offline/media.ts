import { fileUrl, type PublicMedia } from '../courses/student/api';

export function offlineMediaFile(media: PublicMedia | null | undefined) {
  if (!media?.downloadAllowed) return undefined;
  return { url: fileUrl(media.id, true), sizeBytes: media.sizeBytes, mimeType: media.mimeType };
}

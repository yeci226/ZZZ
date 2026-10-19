import type { NewsMedia } from "./media.js";

export interface NewsRequestOptions {
  mediaDelivery?: "official-url" | "attachment";
  onAttachmentsRead?: (metrics: {
    attachmentReadMs: number;
    uploadBytes: number;
    attachmentCount: number;
  }) => void;
}

export function officialMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      /(^|\.)(hoyolab\.com|hoyoverse\.com|mihoyo\.com|hoyocdn\.com|hoyolab-upload\.oss-accelerate\.aliyuncs\.com)$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

/** Resolve at render time so persisted documents keep their original layout and fallback files. */
export function deliveredMedia(
  media: NewsMedia,
  options: NewsRequestOptions,
): NewsMedia {
  if (
    options.mediaDelivery !== "attachment" &&
    !media.slice &&
    officialMediaUrl(media.original)
  ) {
    return { ...media, url: media.original, file: undefined, name: undefined };
  }
  return media;
}

/** File upload with progress (fetch cannot report upload progress). */

import { ApiError } from "./client";
import type { ImportJob } from "./types";

export function uploadImport(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<ImportJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import");
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as ImportJob);
      else {
        const detail = (xhr.response as { detail?: string } | null)?.detail ?? xhr.statusText;
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

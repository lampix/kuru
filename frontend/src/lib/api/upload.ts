/**
 * Resumable, chunked upload of Anki packages (see `POST /api/import/uploads`).
 *
 * Chunks stay well below the 10 MB request-body limit of the Next.js rewrite (and of common
 * reverse proxies). Failed chunks are retried; the server ignores chunks it already has.
 */

import { ApiError, request } from "./client";
import type { ImportJob } from "./types";

const CHUNK_BYTES = 5 * 1024 * 1024;
const RETRIES = 4;

interface UploadState {
  job_id: string;
  received: number;
  size: number;
  max_chunk_bytes: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function putChunk(jobId: string, offset: number, chunk: Blob): Promise<UploadState> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<UploadState>(`/import/uploads/${jobId}?offset=${offset}`, {
        method: "PUT",
        body: chunk,
        headers: { "Content-Type": "application/octet-stream" },
      });
    } catch (error) {
      if (
        attempt >= RETRIES ||
        (error instanceof ApiError && error.status >= 400 && error.status < 500)
      ) {
        throw error;
      }
      await sleep(500 * 2 ** attempt);
    }
  }
}

export async function uploadImport(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<ImportJob> {
  let state = await request<UploadState>("/import/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, size: file.size }),
  });
  const chunkSize = Math.min(CHUNK_BYTES, state.max_chunk_bytes);
  while (state.received < file.size) {
    try {
      state = await putChunk(
        state.job_id,
        state.received,
        file.slice(state.received, state.received + chunkSize),
      );
    } catch (error) {
      // Offset mismatch (e.g. a response was lost): ask the server where to continue.
      if (error instanceof ApiError && error.status === 409) {
        state = await request<UploadState>(`/import/uploads/${state.job_id}`);
        continue;
      }
      throw error;
    }
    onProgress(state.received / file.size);
  }
  return request<ImportJob>(`/import/uploads/${state.job_id}/complete`, { method: "POST" });
}

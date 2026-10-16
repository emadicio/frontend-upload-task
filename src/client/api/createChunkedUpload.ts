import { type UploadFn } from '../components/FileUpload';

import { readErrorMessage } from './readErrorMessage';

type ChunkedUploadOptions = {
    url: string;
    chunkSize?: number;
    concurrency?: number;
    retries?: number;
};

const MEGABYTE = 1024 * 1024;
const RETRY_DELAY = 1000;

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// TODO: resume uploads by asking the server which chunks it has and sending only the missing ones.
// TODO: guard against two uploads with the same name. The server stores chunks by file name only.
/** Returns an UploadFn that splits the file into chunks, sends them in parallel and retries the failed ones. */
export const createChunkedUpload =
    ({ url, chunkSize = 5 * MEGABYTE, concurrency = 3, retries = 2 }: ChunkedUploadOptions): UploadFn =>
    async (file, { signal, onProgress }) => {
        const totalChunks = Math.ceil(file.size / chunkSize);
        // The server merges the file as soon as the last chunk arrives, then deletes the parts.
        // So the last chunk is sent only after all the others succeed, and it is never retried.
        const lastIndex = totalChunks - 1;
        let uploadedBytes = 0;

        // Cancels every chunk request when the caller aborts or a chunk fails.
        const controller = new AbortController();
        const abortChunks = () => controller.abort();
        signal.addEventListener('abort', abortChunks);

        // Network errors and 5xx responses may succeed on a later attempt; 4xx responses and aborts won't.
        const postChunk = async (formData: FormData, maxRetries: number) => {
            for (let attempt = 0; ; attempt++) {
                const isLastAttempt = attempt === maxRetries;
                const response = await fetch(url, { method: 'POST', body: formData, signal: controller.signal }).catch(
                    (error: unknown) => {
                        if (controller.signal.aborted || isLastAttempt) {
                            throw error;
                        }
                        return undefined;
                    }
                );
                if (response?.ok) {
                    return;
                }
                if (response && (response.status < 500 || isLastAttempt)) {
                    throw new Error(await readErrorMessage(response, 'error'));
                }
                await wait(RETRY_DELAY * 2 ** attempt);
            }
        };

        const uploadChunk = async (index: number) => {
            // slice() is lazy, so a large file is never read into memory at once.
            const chunk = file.slice(index * chunkSize, (index + 1) * chunkSize);
            const formData = new FormData();
            // Wrap the chunk in a File: happy-dom ignores the file name argument of append() for a Blob.
            formData.append('file', new File([chunk], file.name));
            formData.append('currentChunkIndex', String(index));
            formData.append('totalChunks', String(totalChunks));

            await postChunk(formData, index === lastIndex ? 0 : retries);
            uploadedBytes += chunk.size;
            onProgress(uploadedBytes);
        };

        let nextIndex = 0;
        const runWorker = async () => {
            while (!controller.signal.aborted && nextIndex < lastIndex) {
                await uploadChunk(nextIndex++);
            }
        };

        try {
            await Promise.all(Array.from({ length: concurrency }, runWorker));
            await uploadChunk(lastIndex);
        } catch (error) {
            abortChunks();
            throw error;
        } finally {
            signal.removeEventListener('abort', abortChunks);
        }
    };

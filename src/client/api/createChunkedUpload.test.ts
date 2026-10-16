import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChunkedUpload } from './createChunkedUpload';

type HeldRequest = {
    index: FormDataEntryValue | null;
    respond: (response: Response) => void;
};

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
const okResponse = () => Response.json({ message: 'Chunk uploaded successfully' });
const serverErrorResponse = () => Response.json({ error: 'Server busy' }, { status: 503 });
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const holdRequests = (): HeldRequest[] => {
    const requests: HeldRequest[] = [];
    fetchMock.mockImplementation(
        (_url, init) =>
            new Promise((resolve, reject) => {
                requests.push({ index: (init?.body as FormData).get('currentChunkIndex'), respond: resolve });
                init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            })
    );

    return requests;
};

const upload = createChunkedUpload({ url: '/api/upload-chunk', chunkSize: 4 });
const twoChunkFile = () => new File(['abcdef'], 'big.txt');
const threeChunkFile = () => new File(['abcdefghij'], 'big.txt');
const fiveChunkFile = () => new File(['abcdefghijklmnopqrst'], 'big.txt');

describe('createChunkedUpload', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it('sends each chunk with the file name, index and chunk count', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(okResponse()));

        await upload(threeChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });

        const sent = await Promise.all(
            fetchMock.mock.calls.map(async ([url, init]) => {
                const body = init?.body as FormData;
                const chunk = body.get('file') as File;
                return {
                    url,
                    method: init?.method,
                    name: chunk.name,
                    content: await chunk.text(),
                    index: body.get('currentChunkIndex'),
                    total: body.get('totalChunks'),
                };
            })
        );
        expect(sent).toEqual([
            { url: '/api/upload-chunk', method: 'POST', name: 'big.txt', content: 'abcd', index: '0', total: '3' },
            { url: '/api/upload-chunk', method: 'POST', name: 'big.txt', content: 'efgh', index: '1', total: '3' },
            { url: '/api/upload-chunk', method: 'POST', name: 'big.txt', content: 'ij', index: '2', total: '3' },
        ]);
    });

    it('sends the last chunk only after all other chunks succeed', async () => {
        const requests = holdRequests();
        const result = upload(threeChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });
        expect(requests.map(({ index }) => index)).toEqual(['0', '1']);

        requests[1].respond(okResponse());
        await flushPromises();
        expect(requests).toHaveLength(2);

        requests[0].respond(okResponse());
        await vi.waitFor(() => expect(requests).toHaveLength(3));
        expect(requests[2].index).toBe('2');

        requests[2].respond(okResponse());
        await expect(result).resolves.toBeUndefined();
    });

    it('sends at most 3 chunks at once', async () => {
        const requests = holdRequests();
        const result = upload(fiveChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });
        expect(requests.map(({ index }) => index)).toEqual(['0', '1', '2']);

        requests[0].respond(okResponse());

        await vi.waitFor(() => expect(requests).toHaveLength(4));
        expect(requests[3].index).toBe('3');

        for (const request of requests.slice(1)) {
            request.respond(okResponse());
        }
        await vi.waitFor(() => expect(requests).toHaveLength(5));
        requests[4].respond(okResponse());
        await expect(result).resolves.toBeUndefined();
    });

    it('reports the bytes of the finished chunks', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(okResponse()));
        const onProgress = vi.fn();

        await upload(threeChunkFile(), { signal: new AbortController().signal, onProgress });

        expect(onProgress.mock.calls).toEqual([[4], [8], [10]]);
    });

    it('cancels the upload without a retry on HTTP 4xx', async () => {
        const requests = holdRequests();
        const result = upload(fiveChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });

        requests[0].respond(Response.json({ error: 'Disk full' }, { status: 400 }));

        await expect(result).rejects.toThrow('Disk full');
        expect(requests).toHaveLength(3);
        expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    });

    it('retries a chunk after HTTP 5xx with a doubling delay', async () => {
        vi.useFakeTimers();
        fetchMock
            .mockImplementation(() => Promise.resolve(okResponse()))
            .mockResolvedValueOnce(serverErrorResponse())
            .mockResolvedValueOnce(serverErrorResponse());
        const result = upload(twoChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });

        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1999);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);

        await expect(result).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('retries a chunk after a network error', async () => {
        vi.useFakeTimers();
        fetchMock
            .mockImplementation(() => Promise.resolve(okResponse()))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const result = upload(twoChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });

        await vi.advanceTimersByTimeAsync(1000);

        await expect(result).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('fails with the error message after 2 retries', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(() => Promise.resolve(serverErrorResponse()));
        const result = upload(twoChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });
        const rejection = expect(result).rejects.toThrow('Server busy');

        await vi.advanceTimersByTimeAsync(3000);

        await rejection;
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('never retries the last chunk', async () => {
        fetchMock
            .mockResolvedValueOnce(okResponse())
            .mockResolvedValueOnce(serverErrorResponse())
            .mockImplementation(() => Promise.resolve(okResponse()));

        const result = upload(twoChunkFile(), { signal: new AbortController().signal, onProgress: vi.fn() });

        await expect(result).rejects.toThrow('Server busy');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('cancels all chunk requests on abort', async () => {
        const requests = holdRequests();
        const controller = new AbortController();
        const result = upload(fiveChunkFile(), { signal: controller.signal, onProgress: vi.fn() });

        controller.abort();

        await expect(result).rejects.toMatchObject({ name: 'AbortError' });
        expect(requests.map(({ index }) => index)).toEqual(['0', '1', '2']);
        expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    });
});

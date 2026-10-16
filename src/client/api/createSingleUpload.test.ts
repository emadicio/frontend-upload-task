import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSingleUpload } from './createSingleUpload';

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createSingleUpload', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it('sends the file in one POST request', async () => {
        fetchMock.mockResolvedValue(jsonResponse(200, { message: 'File uploaded successfully' }));
        const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
        const { signal } = new AbortController();

        await createSingleUpload({ url: '/api/upload-single' })(file, { signal, onProgress: vi.fn() });

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/upload-single');
        expect(init?.method).toBe('POST');
        expect(init?.signal).toBe(signal);
        const sentFile = (init?.body as FormData).get('file') as File;
        expect(sentFile.name).toBe('hello.txt');
        expect(await sentFile.text()).toBe('hello');
    });

    it('reports the whole file as uploaded when the request succeeds', async () => {
        fetchMock.mockResolvedValue(jsonResponse(200, { message: 'File uploaded successfully' }));
        const onProgress = vi.fn();

        await createSingleUpload({ url: '/api/upload-single' })(new File(['hello'], 'hello.txt'), {
            signal: new AbortController().signal,
            onProgress,
        });

        expect(onProgress).toHaveBeenCalledWith(5);
    });

    it('rejects with the error message from the response body', async () => {
        fetchMock.mockResolvedValue(jsonResponse(400, { error: 'Missing required `file` key in body.' }));

        const result = createSingleUpload({ url: '/api/upload-single' })(new File(['hello'], 'hello.txt'), {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });

        await expect(result).rejects.toThrow('Missing required `file` key in body.');
    });

    it('rejects with the HTTP status when the body has no error message', async () => {
        fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

        const result = createSingleUpload({ url: '/api/upload-single' })(new File(['hello'], 'hello.txt'), {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });

        await expect(result).rejects.toThrow('Request failed with HTTP 502');
    });
});

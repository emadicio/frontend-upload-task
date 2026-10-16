import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadFile } from './uploadFile';

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
const fiveMegabytes = 5 * 1024 * 1024;

describe('uploadFile', () => {
    beforeEach(() => {
        fetchMock.mockImplementation(() => Promise.resolve(Response.json({ message: 'File uploaded successfully' })));
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it('sends a file of 5 MB in one request', async () => {
        await uploadFile(new File([new Uint8Array(fiveMegabytes)], 'five.bin'), {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/upload-single']);
    });

    it('sends a bigger file to the chunk endpoint', async () => {
        await uploadFile(new File([new Uint8Array(fiveMegabytes + 1)], 'big.bin'), {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/upload-chunk', '/api/upload-chunk']);
    });
});

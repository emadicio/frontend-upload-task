import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchFiles } from './fetchFiles';

describe('fetchFiles', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects with the error message from the response body', async () => {
        vi.stubGlobal('fetch', () =>
            Promise.resolve(Response.json({ message: 'Error reading upload directory' }, { status: 500 }))
        );

        await expect(fetchFiles({ signal: new AbortController().signal })).rejects.toThrow(
            'Error reading upload directory'
        );
    });
});

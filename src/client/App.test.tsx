import { render } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';
import { App } from './App';

// TODO: add a Playwright test against the running app for the full browser → Express → disk path.
describe('App', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should render the demo page with the files on the server', async () => {
        const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(() =>
            Promise.resolve(Response.json({ files: [{ name: 'report.pdf', size: 2048 }] }))
        );
        vi.stubGlobal('fetch', fetchMock);

        const { getByRole, getByLabelText, findByText } = render(<App />);

        expect(getByRole('heading', { name: 'File upload' })).toBeInTheDocument();
        expect(getByLabelText(/choose files/i)).toBeInTheDocument();
        expect(await findByText('report.pdf')).toBeInTheDocument();
        expect(fetchMock.mock.calls[0][0]).toBe('/api/files');
    });
});

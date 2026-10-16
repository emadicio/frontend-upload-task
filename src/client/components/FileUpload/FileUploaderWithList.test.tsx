import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';
import { FileUploaderWithList } from './FileUploaderWithList';
import { type FetchFilesFn, type UploadedFile, type UploadFn } from './types';

const upload: UploadFn = () => Promise.resolve();

const selectFiles = async (...files: File[]) => {
    await userEvent.setup().upload(screen.getByLabelText(/choose files/i), files);
};

const getFileList = () => screen.getByRole('list', { name: 'Uploaded files' });

describe('FileUploaderWithList', () => {
    afterEach(() => {
        cleanup();
    });

    it('shows a loading state, then the files on the server', async () => {
        let resolveFiles!: (files: UploadedFile[]) => void;
        const fetchFiles: FetchFilesFn = () =>
            new Promise((resolve) => {
                resolveFiles = resolve;
            });
        render(<FileUploaderWithList upload={upload} fetchFiles={fetchFiles} />);

        expect(screen.getByText('Loading files…')).toBeInTheDocument();

        resolveFiles([
            { name: 'report.pdf', size: 2048 },
            { name: 'notes.txt', size: 12 },
        ]);

        const items = within(await screen.findByRole('list', { name: 'Uploaded files' })).getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('report.pdf');
        expect(items[0]).toHaveTextContent('2.0 KB');
        expect(items[1]).toHaveTextContent('notes.txt');
        expect(items[1]).toHaveTextContent('12 B');
        expect(screen.queryByText('Loading files…')).not.toBeInTheDocument();
    });

    it('shows the reason when the files cannot load', async () => {
        const fetchFiles: FetchFilesFn = () => Promise.reject(new Error('Server down'));
        render(<FileUploaderWithList upload={upload} fetchFiles={fetchFiles} />);

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the files: Server down');
    });

    it('shows an empty state when the server has no files', async () => {
        const fetchFiles: FetchFilesFn = () => Promise.resolve([]);
        render(<FileUploaderWithList upload={upload} fetchFiles={fetchFiles} />);

        expect(await screen.findByText('No files uploaded yet.')).toBeInTheDocument();
    });

    it('adds an uploaded file to the list without loading the files again', async () => {
        const fetchFiles = vi.fn<Parameters<FetchFilesFn>, ReturnType<FetchFilesFn>>(() =>
            Promise.resolve([{ name: 'report.pdf', size: 2048 }])
        );
        render(<FileUploaderWithList upload={upload} fetchFiles={fetchFiles} />);
        await screen.findByRole('list', { name: 'Uploaded files' });

        await selectFiles(new File(['hello'], 'hello.txt'));

        await waitFor(() => expect(within(getFileList()).getAllByRole('listitem')).toHaveLength(2));
        expect(within(getFileList()).getAllByRole('listitem')[1]).toHaveTextContent('hello.txt');
        expect(fetchFiles).toHaveBeenCalledOnce();
    });

    it('keeps a file that is uploaded before the list loads', async () => {
        let resolveFiles!: (files: UploadedFile[]) => void;
        const fetchFiles: FetchFilesFn = () =>
            new Promise((resolve) => {
                resolveFiles = resolve;
            });
        render(<FileUploaderWithList upload={upload} fetchFiles={fetchFiles} />);

        await selectFiles(new File(['hello'], 'hello.txt'));
        expect(await screen.findByRole('list', { name: 'Uploaded files' })).toHaveTextContent('hello.txt');

        resolveFiles([{ name: 'report.pdf', size: 2048 }]);

        await waitFor(() => expect(within(getFileList()).getAllByRole('listitem')).toHaveLength(2));
        expect(getFileList()).toHaveTextContent('report.pdf');
        expect(getFileList()).toHaveTextContent('hello.txt');
    });

    it('replaces the entry of a file with the same name', async () => {
        const fetchFiles: FetchFilesFn = () => Promise.resolve([{ name: 'hello.txt', size: 1 }]);
        render(<FileUploaderWithList upload={upload} fetchFiles={fetchFiles} />);
        await screen.findByRole('list', { name: 'Uploaded files' });

        await selectFiles(new File(['hello'], 'hello.txt'));

        await waitFor(() => expect(within(getFileList()).getByRole('listitem')).toHaveTextContent('5 B'));
        expect(within(getFileList()).getAllByRole('listitem')).toHaveLength(1);
    });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';
import { FileUploader } from './FileUploader';
import { type UploadFn, type UploadOptions } from './types';

type PendingUpload = {
    file: File;
    options: UploadOptions;
    resolve: () => void;
    reject: (error: Error) => void;
};

const createFakeUpload = () => {
    const pending: PendingUpload[] = [];
    const upload: UploadFn = (file, options) =>
        new Promise((resolve, reject) => {
            pending.push({ file, options, resolve, reject });
        });

    return { upload, pending };
};

const selectFiles = async (...files: File[]) => {
    await userEvent.setup().upload(screen.getByLabelText(/choose files/i), files);
};

describe('FileUploader', () => {
    afterEach(() => {
        cleanup();
    });

    it('adds one row per selected file and announces them', async () => {
        render(<FileUploader upload={createFakeUpload().upload} />);

        await selectFiles(new File(['a'], 'a.txt'), new File(['bb'], 'b.txt'));

        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('a.txt');
        expect(rows[1]).toHaveTextContent('b.txt');
        expect(screen.getByRole('status')).toHaveTextContent('2 files added');
    });

    it('adds one row per file dropped on the drop zone', () => {
        render(<FileUploader upload={createFakeUpload().upload} />);

        fireEvent.drop(screen.getByText(/choose files/i), {
            dataTransfer: { files: [new File(['a'], 'a.txt'), new File(['bb'], 'b.txt')] },
        });

        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('a.txt');
        expect(rows[1]).toHaveTextContent('b.txt');
    });

    it('starts each file once when files are chosen and dropped together', () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);

        act(() => {
            fireEvent.change(screen.getByLabelText(/choose files/i), {
                target: { files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')] },
            });
            fireEvent.drop(screen.getByText(/choose files/i), {
                dataTransfer: { files: [new File(['c'], 'c.txt')] },
            });
        });

        expect(pending.map(({ file }) => file.name)).toEqual(['a.txt', 'b.txt']);
    });

    it('adds only the first dropped file when multiple is false', () => {
        render(<FileUploader upload={createFakeUpload().upload} multiple={false} />);

        fireEvent.drop(screen.getByText(/choose files/i), {
            dataTransfer: { files: [new File(['a'], 'a.txt'), new File(['bb'], 'b.txt')] },
        });

        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent('a.txt');
    });

    it('shows the upload progress of each file', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['0123456789'], 'hello.txt'));

        act(() => pending[0].options.onProgress(5));

        expect(screen.getByRole('progressbar', { name: /hello\.txt/ })).toHaveAttribute('value', '50');
        expect(screen.getByRole('listitem')).toHaveTextContent('50%');
    });

    it('marks a file as done and announces it when its upload succeeds', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['hello'], 'hello.txt'));

        pending[0].resolve();

        const row = screen.getByRole('listitem');
        await waitFor(() => expect(row).toHaveTextContent('Done'));
        expect(row).toHaveTextContent('100%');
        expect(screen.getByRole('status')).toHaveTextContent('hello.txt uploaded');
    });

    it('shows the reason and announces it when an upload fails', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['hello'], 'hello.txt'));

        pending[0].reject(new Error('Disk full'));

        const row = screen.getByRole('listitem');
        await waitFor(() => expect(row).toHaveTextContent('Failed'));
        expect(row).toHaveTextContent('Disk full');
        expect(screen.getByRole('status')).toHaveTextContent('hello.txt failed: Disk full');
    });

    it('retries a failed upload from the start', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['hello'], 'hello.txt'));
        act(() => pending[0].options.onProgress(3));
        pending[0].reject(new Error('Disk full'));

        await userEvent.setup().click(await screen.findByRole('button', { name: 'Retry hello.txt' }));

        expect(pending).toHaveLength(2);
        const row = screen.getByRole('listitem');
        expect(row).toHaveTextContent('Uploading');
        expect(row).toHaveTextContent('0%');
        expect(row).not.toHaveTextContent('Disk full');

        pending[1].resolve();

        await waitFor(() => expect(row).toHaveTextContent('Done'));
    });

    it('moves the focus to Remove when Retry is pressed', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['hello'], 'hello.txt'));
        pending[0].reject(new Error('Disk full'));

        await userEvent.setup().click(await screen.findByRole('button', { name: 'Retry hello.txt' }));

        expect(screen.getByRole('button', { name: 'Remove hello.txt' })).toHaveFocus();
    });

    it('passes the file to onUploaded when its upload succeeds', async () => {
        const { upload, pending } = createFakeUpload();
        const onUploaded = vi.fn();
        render(<FileUploader upload={upload} onUploaded={onUploaded} />);
        const file = new File(['hello'], 'hello.txt');
        await selectFiles(file);

        pending[0].resolve();

        await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(file));
    });

    it('uploads at most 2 files at once, in the order they were added', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(
            new File(['a'], 'a.txt'),
            new File(['b'], 'b.txt'),
            new File(['c'], 'c.txt'),
            new File(['d'], 'd.txt')
        );

        const rows = screen.getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('Uploading');
        expect(rows[1]).toHaveTextContent('Uploading');
        expect(rows[2]).toHaveTextContent('Queued');
        expect(rows[3]).toHaveTextContent('Queued');

        pending[0].reject(new Error('Disk full'));

        await waitFor(() => expect(rows[2]).toHaveTextContent('Uploading'));
        expect(rows[3]).toHaveTextContent('Queued');

        pending[1].resolve();

        await waitFor(() => expect(rows[3]).toHaveTextContent('Uploading'));
    });

    it('announces each upload when two uploads end at the same time', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['a'], 'a.txt'), new File(['b'], 'b.txt'));

        pending[0].resolve();
        pending[1].resolve();

        const status = screen.getByRole('status');
        await waitFor(() => expect(status).toHaveTextContent('b.txt uploaded'));
        expect(status).toHaveTextContent('a.txt uploaded');
    });

    it('stops the upload and removes the row when Remove is pressed', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['hello'], 'hello.txt'));

        await userEvent.setup().click(screen.getByRole('button', { name: 'Remove hello.txt' }));

        expect(pending[0].options.signal.aborted).toBe(true);
        expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('hello.txt removed');

        // Like a real upload function, the fake rejects after the abort.
        pending[0].reject(new DOMException('Aborted', 'AbortError'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(status).not.toHaveTextContent('failed');
    });

    it('starts the next remaining file when an upload is removed', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(
            new File(['a'], 'a.txt'),
            new File(['b'], 'b.txt'),
            new File(['c'], 'c.txt'),
            new File(['d'], 'd.txt')
        );
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Remove c.txt' }));
        await user.click(screen.getByRole('button', { name: 'Remove a.txt' }));

        expect(pending.map(({ file }) => file.name)).toEqual(['a.txt', 'b.txt', 'd.txt']);
    });

    it('moves the focus to the nearest row, or the file input, when a row is removed', async () => {
        render(<FileUploader upload={createFakeUpload().upload} />);
        await selectFiles(new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['c'], 'c.txt'));
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Remove b.txt' }));
        expect(screen.getByRole('button', { name: 'Remove c.txt' })).toHaveFocus();

        await user.click(screen.getByRole('button', { name: 'Remove c.txt' }));
        expect(screen.getByRole('button', { name: 'Remove a.txt' })).toHaveFocus();

        await user.click(screen.getByRole('button', { name: 'Remove a.txt' }));
        expect(screen.getByLabelText(/choose files/i)).toHaveFocus();
    });

    it('removes the done rows when Clear all done is pressed', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['a'], 'a.txt'), new File(['b'], 'b.txt'));
        pending[0].resolve();

        await userEvent.setup().click(await screen.findByRole('button', { name: 'Clear all done' }));

        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent('b.txt');
    });

    it('moves the focus to the file input when Clear all done is pressed', async () => {
        const { upload, pending } = createFakeUpload();
        render(<FileUploader upload={upload} />);
        await selectFiles(new File(['a'], 'a.txt'));
        pending[0].resolve();

        await userEvent.setup().click(await screen.findByRole('button', { name: 'Clear all done' }));

        expect(screen.getByLabelText(/choose files/i)).toHaveFocus();
    });

    it('stops all uploads when the uploader unmounts', async () => {
        const { upload, pending } = createFakeUpload();
        const { unmount } = render(<FileUploader upload={upload} />);
        await selectFiles(new File(['a'], 'a.txt'), new File(['b'], 'b.txt'));

        unmount();

        expect(pending.map(({ options }) => options.signal.aborted)).toEqual([true, true]);
    });

    it('shows the size of each file', async () => {
        render(<FileUploader upload={createFakeUpload().upload} />);

        await selectFiles(new File(['hello'], 'small.txt'), new File([new Uint8Array(1536)], 'large.bin'));

        const rows = screen.getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('5 B');
        expect(rows[1]).toHaveTextContent('1.5 KB');
    });
});

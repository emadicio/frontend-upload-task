import { type ReactElement, useId } from 'react';

import { formatBytes } from './formatBytes';
import { type FileListStatus, type UploadedFile } from './types';

type FileListProps = {
    files: UploadedFile[];
    status: FileListStatus;
    error?: string;
};

export const FileList = ({ files, status, error }: FileListProps): ReactElement => {
    const headingId = useId();

    return (
        <section>
            <h2 id={headingId} className="mb-3 text-xl font-semibold text-gray-900">
                Uploaded files
            </h2>

            {status === 'loading' && <p className="text-gray-700">Loading files…</p>}

            {status === 'error' && (
                <p role="alert" className="text-red-700">
                    Could not load the files: {error}
                </p>
            )}

            {status === 'success' && files.length === 0 && <p className="text-gray-700">No files uploaded yet.</p>}

            {/* TODO: virtualize the list if it grows to thousands of files. */}
            {files.length > 0 && (
                <ul
                    aria-labelledby={headingId}
                    className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white"
                >
                    {files.map((file) => (
                        <li key={file.name} className="flex justify-between gap-4 px-3 py-2">
                            <span className="min-w-0 truncate text-gray-900">{file.name}</span>
                            <span className="shrink-0 text-sm text-gray-700">{formatBytes(file.size)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

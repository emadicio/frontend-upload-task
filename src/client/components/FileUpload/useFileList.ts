import { useCallback, useEffect, useState } from 'react';

import { type FetchFilesFn, type FileListStatus, type UploadedFile } from './types';

// Merges the server's files with the completed local uploads, so a bulk upload doesn't refetch the list per file.
// In a real app, consider whether refetching is the better solution overall.
const mergeFiles = (older: UploadedFile[], newer: UploadedFile[]): UploadedFile[] => [
    ...older.filter((file) => !newer.some(({ name }) => name === file.name)),
    ...newer,
];

export const useFileList = (fetchFiles: FetchFilesFn) => {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [status, setStatus] = useState<FileListStatus>('loading');
    const [errorMessage, setErrorMessage] = useState<string>();

    // TODO: the list loads once. Refetch it when other clients upload files too.
    useEffect(() => {
        const controller = new AbortController();
        fetchFiles({ signal: controller.signal }).then(
            (loadedFiles) => {
                if (controller.signal.aborted) {
                    return;
                }
                // Files uploaded while the list loads are newer than the loaded entries.
                setFiles((uploadedFiles) => mergeFiles(loadedFiles, uploadedFiles));
                setStatus('success');
            },
            (error: unknown) => {
                if (controller.signal.aborted) {
                    return;
                }
                setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
                setStatus('error');
            }
        );

        return () => controller.abort();
    }, [fetchFiles]);

    const addFile = useCallback((file: UploadedFile) => {
        setFiles((current) => mergeFiles(current, [file]));
    }, []);

    return { files, status, error: errorMessage, addFile };
};

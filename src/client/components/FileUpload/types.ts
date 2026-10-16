export type UploadOptions = {
    signal: AbortSignal;
    onProgress: (uploadedBytes: number) => void;
};

/**
 * Uploads one file and resolves when the upload is done.
 * The components depend only on this type, so any API or transport (REST, chunks, GraphQL) can plug in.
 */
export type UploadFn = (file: File, options: UploadOptions) => Promise<void>;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export type UploadedFile = {
    name: string;
    size: number;
};

export type FetchFilesFn = (options: { signal: AbortSignal }) => Promise<UploadedFile[]>;

export type FileListStatus = 'loading' | 'success' | 'error';

import { type UploadFn } from '../components/FileUpload';

import { readErrorMessage } from './readErrorMessage';

type SingleUploadOptions = {
    url: string;
};

/** Returns an UploadFn that sends the whole file in one request. The progress goes from 0 to 100% when it ends. */
export const createSingleUpload =
    ({ url }: SingleUploadOptions): UploadFn =>
    async (file, { signal, onProgress }) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(url, { method: 'POST', body: formData, signal });
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'error'));
        }

        onProgress(file.size);
    };

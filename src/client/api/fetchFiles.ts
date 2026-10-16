import { type FetchFilesFn, type UploadedFile } from '../components/FileUpload';

import { readErrorMessage } from './readErrorMessage';

/** Loads the name and size of each uploaded file from the server. */
export const fetchFiles: FetchFilesFn = async ({ signal }) => {
    const response = await fetch('/api/files', { signal });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'message'));
    }

    const body = (await response.json()) as { files: UploadedFile[] };
    return body.files;
};

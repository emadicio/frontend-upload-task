import { type UploadFn } from '../components/FileUpload';

import { createChunkedUpload } from './createChunkedUpload';
import { createSingleUpload } from './createSingleUpload';

const SINGLE_UPLOAD_URL = '/api/upload-single';
const CHUNK_UPLOAD_URL = '/api/upload-chunk';
// Match the chunk size to the upload platform, for example 5 MB, the minimum part size of S3 multipart uploads.
const CHUNK_SIZE = 5 * 1024 * 1024;

const singleUpload = createSingleUpload({ url: SINGLE_UPLOAD_URL });
const chunkedUpload = createChunkedUpload({ url: CHUNK_UPLOAD_URL, chunkSize: CHUNK_SIZE });

/** Uploads a file to the server: in one request up to CHUNK_SIZE, in chunks above it. */
export const uploadFile: UploadFn = (file, options) =>
    file.size <= CHUNK_SIZE ? singleUpload(file, options) : chunkedUpload(file, options);

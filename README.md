# File uploader and list

Reusable, accessible React components to upload files and list the files on a server. The uploader works with or without the list. A small demo page connects both to the server in this repository.

- Choose files with the file input or drop them onto the drop zone. Each file upload shows a row with its status, a progress bar and actions.
- Several files upload in parallel. Large files are sent in chunks, several chunks at a time.
- Failed chunks are retried automatically. A failed file can be retried or removed, and removing a running upload cancels it.
- The file list shows the files on the server and adds new uploads without fetching the list again.

## Getting started

Use Node 20 (see `.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000

| Command                     | Description                                                           |
| :-------------------------- | :-------------------------------------------------------------------- |
| `npx vitest run src/client` | Runs the client tests once (`npm run test:client` starts watch mode). |
| `npm run lint`              | Runs ESLint.                                                          |
| `npm run typecheck`         | Type-checks the client.                                               |
| `npm run test:server`       | Runs the provided server tests.                                       |

## How it works

- `src/client/App.tsx` is the demo page.
- `src/client/components/FileUpload/` is the reusable component. It imports nothing from `src/client/api/`.
    - `FileUploader` renders the drop zone and one row per upload. `useUploadQueue` holds the upload state.
    - `FileList` renders the files and `useFileList` loads them.
    - `FileUploaderWithList` combines the two.
- `src/client/api/` contains the code for this server: `createSingleUpload` and `createChunkedUpload`, `uploadFile`, which picks one of them by file size, and `fetchFiles`.

## Usage

Everything is exported from `src/client/components/FileUpload/index.ts`. The component doesn't know about any API: it takes an upload function and, for the file list, a function that loads the files. The examples use `uploadFile` and `fetchFiles` from `src/client/api/`, which talk to this server.

### Uploader with file list

```tsx
import { FileUploaderWithList } from './components/FileUpload';

<FileUploaderWithList upload={uploadFile} fetchFiles={fetchFiles} />;
```

### Uploader only

```tsx
import { FileUploader } from './components/FileUpload';

<FileUploader upload={uploadFile} onUploaded={(file) => console.log(file.name)} accept="image/*" />;
```

`accept` and `multiple` (default `true`) are passed to the native file input. With `multiple={false}`, dropping several files adds only the first one.

### Custom layout

`FileList` only renders the props it gets, and `useFileList` loads the data, so the pieces can be placed individually wherever they are needed in the app:

```tsx
import { type ReactElement, useCallback } from 'react';

import { FileList, FileUploader, useFileList } from './components/FileUpload';

export const AssetSidebar = (): ReactElement => {
    const { files, status, error, addFile } = useFileList(fetchFiles);
    const handleUploaded = useCallback((file: File) => addFile({ name: file.name, size: file.size }), [addFile]);

    return (
        <aside>
            <FileList files={files} status={status} error={error} />
            <FileUploader upload={uploadFile} onUploaded={handleUploaded} multiple={false} />
        </aside>
    );
};
```

`useFileList` loads the list again whenever `fetchFiles` changes, so pass a stable function (defined at module level or wrapped in `useCallback`).

### Writing an upload function

```ts
type UploadFn = (
    file: File,
    options: { signal: AbortSignal; onProgress: (uploadedBytes: number) => void }
) => Promise<void>;
```

An upload function resolves when the upload is complete and rejects with an `Error` whose message is shown in the row. It reports progress in bytes through `onProgress` and stops when `signal` is aborted.

For example, this one uploads to a GraphQL server that follows the GraphQL multipart request spec:

```ts
import { type UploadFn } from './components/FileUpload';

export const createGraphQLUpload =
    ({ url }: { url: string }): UploadFn =>
    async (file, { signal, onProgress }) => {
        const formData = new FormData();
        const query = 'mutation ($file: Upload!) { singleUpload(file: $file) { id } }';
        formData.append('operations', JSON.stringify({ query, variables: { file: null } }));
        formData.append('map', JSON.stringify({ 0: ['variables.file'] }));
        formData.append('0', file);

        const response = await fetch(url, { method: 'POST', body: formData, signal });
        const body = (await response.json().catch(() => ({}))) as { errors?: { message: string }[] };
        if (!response.ok || body.errors) {
            throw new Error(body.errors?.[0]?.message ?? `Request failed with HTTP ${response.status}`);
        }

        onProgress(file.size);
    };
```

The components don't need to change.

### Design decisions

The components only depend on the `UploadFn` type, so supporting another API or transport means writing one function. Cancellation uses the standard `AbortSignal`, and a fake upload function for tests takes a few lines.

Uploads use `fetch`, which has no upload progress events. Files up to 5 MB go in a single request. Larger files are split into 5 MB chunks with `Blob.slice`, and the progress bar moves after each chunk.

Up to 2 files upload at a time, and each chunked upload sends up to 3 chunks at a time. That's at most 6 requests, the browser's per-host connection limit on HTTP/1.1. The server merges the file as soon as the last chunk arrives, so the last chunk is sent only after all the others have succeeded.

A chunk is retried up to 2 times after a network error or a 5xx response, after 1 second and then 2 seconds. 4xx responses and aborts aren't retried. The last chunk isn't retried either, because the server deletes the parts once it has merged them. Removing a row or unmounting the uploader cancels its uploads.

The file list loads once. When an upload finishes, its name and size are added to the list locally, replacing any entry with the same name. This way, a bulk upload doesn't refetch the list after every file. In a real app, consider whether refetching is the better solution overall.

The upload state lives in a reducer with immutable updates. Rows are memoized and their callbacks are stable, so a progress update re-renders a single row.

For accessibility:

- The drop zone is a `<label>` around a visually hidden native file input, so keyboard and screen reader users get the native behavior. Drag and drop is added on top for pointer users.
- A single `role="status"` region announces added, uploaded, failed and removed files.
- Each row has a labeled `<progress>` element and shows the percentage as text.
- The focus never gets lost. After Remove, it moves to the next row, the previous row or the file input. After Retry, it moves to the row's Remove button. After Clear all done, it moves to the file input.

### Tests

The tests stub the network and never start the server. Each public part has its own test file: the upload functions with `fetch` stubbed, `FileUploader` and `FileUploaderWithList` with a fake upload function, and a smoke test for the demo page.

## Known limitations

On the server:

- Chunks are stored by file name only, so two uploads with the same name at the same time corrupt each other. A new file also overwrites an existing file with the same name.
- There is no cleanup endpoint, so a cancelled chunked upload leaves its parts in `uploads-chunks/`.
- `mergeChunks` doesn't wait for the write stream to finish. In my tests with 20, 100 and 300 MB files, the merged files still had the right size.
- The file name from the client goes into the file path without any checks.
- 3 of the 4 provided server tests fail with HTTP 400. They run in happy-dom, the test environment set in `vite.config.ts`, which doesn't send multipart files that multer can read. I left the test config unchanged.

On the client:

- Files of 5 MB or less jump from 0% to 100% in one step.
- Dropped files skip the `accept` filter of the file input.

## Future work

These are marked with `TODO` comments in the code:

- Resumable uploads: ask the server which chunks it already has and send only the missing ones.
- Prevent two uploads with the same name.
- Validate files (maximum size, file type) before they're queued.
- Support dropped folders.
- Virtualize the file list once it grows to thousands of files.
- Refetch the list when other clients upload files too.
- Translations.
- Playwright tests against the running app.

## API reference

The server API was already defined in [`src/server/server.ts`](src/server/server.ts): `GET /api/files`, `POST /api/upload-single` and `POST /api/upload-chunk`. See the code for the request fields and responses.

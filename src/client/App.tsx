import { type ReactElement } from 'react';

import { fetchFiles, uploadFile } from './api';
import { FileUploaderWithList } from './components/FileUpload';

export const App = (): ReactElement => {
    return (
        <main className="mx-auto max-w-2xl px-4 py-12">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">File upload</h1>
            <p className="mt-2 text-gray-700">Upload files to the server.</p>

            <div className="mt-8">
                <FileUploaderWithList upload={uploadFile} fetchFiles={fetchFiles} />
            </div>
        </main>
    );
};

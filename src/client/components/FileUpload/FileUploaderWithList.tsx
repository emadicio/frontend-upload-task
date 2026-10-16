import { type ReactElement, useCallback } from 'react';

import { FileList } from './FileList';
import { FileUploader } from './FileUploader';
import { type FetchFilesFn, type UploadFn } from './types';
import { useFileList } from './useFileList';

type FileUploaderWithListProps = {
    upload: UploadFn;
    fetchFiles: FetchFilesFn;
    accept?: string;
    multiple?: boolean;
};

export const FileUploaderWithList = ({
    upload,
    fetchFiles,
    accept,
    multiple,
}: FileUploaderWithListProps): ReactElement => {
    const { files, status, error, addFile } = useFileList(fetchFiles);
    const handleUploaded = useCallback((file: File) => addFile({ name: file.name, size: file.size }), [addFile]);

    return (
        <div className="space-y-8">
            <FileUploader upload={upload} onUploaded={handleUploaded} accept={accept} multiple={multiple} />
            <FileList files={files} status={status} error={error} />
        </div>
    );
};

import { type ChangeEvent, type DragEvent, type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

import { FileUploaderRow } from './FileUploaderRow';
import { type UploadFn } from './types';
import { useUploadQueue } from './useUploadQueue';

type FileUploaderProps = {
    upload: UploadFn;
    onUploaded?: (file: File) => void;
    accept?: string;
    multiple?: boolean;
};

type Announcement = {
    id: number;
    text: string;
};

// Messages are appended rather than replaced, so two uploads that finish together are both announced.
const MAX_ANNOUNCEMENTS = 5;
let nextAnnouncementId = 0;

// TODO: the texts are hard-coded English. Accept them as props or use an i18n library once translations are needed.
export const FileUploader = ({ upload, onUploaded, accept, multiple = true }: FileUploaderProps): ReactElement => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const announce = useCallback((text: string) => {
        const id = nextAnnouncementId++;
        setAnnouncements((current) => [...current, { id, text }].slice(-MAX_ANNOUNCEMENTS));
    }, []);
    const handleUploaded = useCallback(
        (file: File) => {
            announce(`${file.name} uploaded`);
            onUploaded?.(file);
        },
        [announce, onUploaded]
    );
    const handleFailed = useCallback(
        (file: File, error: string) => {
            announce(`${file.name} failed: ${error}`);
        },
        [announce]
    );
    const { items, addFiles, retry, remove, clearDone } = useUploadQueue(upload, {
        onUploaded: handleUploaded,
        onFailed: handleFailed,
    });

    const inputRef = useRef<HTMLInputElement>(null);
    const removeButtons = useRef(new Map<string, HTMLButtonElement>());
    // The row callbacks read the items from a ref so they stay stable and a progress update re-renders one row only.
    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    const registerRemoveButton = useCallback((id: string, button: HTMLButtonElement | null) => {
        if (button) {
            removeButtons.current.set(id, button);
        } else {
            removeButtons.current.delete(id);
        }
    }, []);

    const handleRetry = useCallback(
        (id: string) => {
            // The Retry button disappears once the row is queued again, so move the focus to Remove first.
            removeButtons.current.get(id)?.focus();
            retry(id);
        },
        [retry]
    );

    const handleRemove = useCallback(
        (id: string) => {
            const currentItems = itemsRef.current;
            const index = currentItems.findIndex((item) => item.id === id);
            const neighbor = currentItems[index + 1] ?? currentItems[index - 1];
            // Move the focus before the row unmounts so it doesn't fall back to the page body.
            (neighbor ? removeButtons.current.get(neighbor.id) : inputRef.current)?.focus();
            remove(id);
            announce(`${currentItems[index].file.name} removed`);
        },
        [announce, remove]
    );

    const handleClearDone = () => {
        inputRef.current?.focus();
        clearDone();
    };

    const addSelectedFiles = (files: File[]) => {
        if (files.length === 0) {
            return;
        }

        // TODO: validate the files (maximum size, file type) before they reach the queue.
        addFiles(files);
        announce(`${files.length} ${files.length === 1 ? 'file' : 'files'} added`);
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        // Reset the input so that choosing the same file again fires a change event.
        event.target.value = '';
        addSelectedFiles(files);
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes('Files')) {
            return;
        }
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        // dragleave also fires when the pointer moves onto a child of the drop zone.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
        }
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        // TODO: support dropped folders by reading them with webkitGetAsEntry().
        const files = Array.from(event.dataTransfer.files);
        addSelectedFiles(multiple ? files : files.slice(0, 1));
    };

    return (
        <div>
            {/* Drag and drop is an enhancement for pointer users; keyboard users use the file input. */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                <label
                    className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center hover:border-gray-400 has-[:focus-visible]:border-blue-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700 ${isDragging ? 'border-blue-700 bg-blue-50' : 'border-gray-300 bg-white'}`}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        className="sr-only"
                        accept={accept}
                        multiple={multiple}
                        onChange={handleChange}
                    />
                    <span className="font-semibold text-blue-700">Choose files to upload</span>
                    <span className="mt-1 text-sm text-gray-700">or drop them here</span>
                </label>
            </div>

            {items.length > 0 && (
                <div className="mt-4">
                    {items.some((item) => item.status === 'done') && (
                        <div className="mb-2 flex justify-end">
                            <button
                                type="button"
                                onClick={handleClearDone}
                                className="rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                            >
                                Clear all done
                            </button>
                        </div>
                    )}
                    <ul aria-label="Uploads" className="space-y-2">
                        {items.map((item) => (
                            <FileUploaderRow
                                key={item.id}
                                item={item}
                                onRetry={handleRetry}
                                onRemove={handleRemove}
                                registerRemoveButton={registerRemoveButton}
                            />
                        ))}
                    </ul>
                </div>
            )}

            <div role="status" aria-atomic="false" className="sr-only">
                {announcements.map(({ id, text }) => (
                    <p key={id}>{text}</p>
                ))}
            </div>
        </div>
    );
};

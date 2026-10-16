import { memo, type ReactElement } from 'react';

import { formatBytes } from './formatBytes';
import { type UploadStatus } from './types';
import { type UploadItem } from './useUploadQueue';

type FileUploaderRowProps = {
    item: UploadItem;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
    registerRemoveButton: (id: string, button: HTMLButtonElement | null) => void;
};

const STATUS_TEXT: Record<UploadStatus, string> = {
    queued: 'Queued',
    uploading: 'Uploading',
    done: 'Done',
    failed: 'Failed',
};

const PROGRESS_COLOR_CLASS: Record<UploadStatus, string> = {
    queued: '[&::-moz-progress-bar]:bg-blue-700 [&::-webkit-progress-value]:bg-blue-700',
    uploading: '[&::-moz-progress-bar]:bg-blue-700 [&::-webkit-progress-value]:bg-blue-700',
    done: '[&::-moz-progress-bar]:bg-green-700 [&::-webkit-progress-value]:bg-green-700',
    failed: '[&::-moz-progress-bar]:bg-red-700 [&::-webkit-progress-value]:bg-red-700',
};

const getPercent = ({ file, status, uploadedBytes }: UploadItem): number => {
    if (status === 'done') {
        return 100;
    }

    return file.size === 0 ? 0 : Math.round((uploadedBytes / file.size) * 100);
};

const FileUploaderRowComponent = ({
    item,
    onRetry,
    onRemove,
    registerRemoveButton,
}: FileUploaderRowProps): ReactElement => {
    const percent = getPercent(item);

    return (
        <li className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-4">
                <span className="min-w-0 truncate">
                    <span className="font-medium text-gray-900">{item.file.name}</span>
                    <span className="ml-2 text-sm text-gray-700">{formatBytes(item.file.size)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="text-gray-700">{STATUS_TEXT[item.status]}</span>
                    {item.status === 'failed' && (
                        <button
                            type="button"
                            aria-label={`Retry ${item.file.name}`}
                            onClick={() => onRetry(item.id)}
                            className="rounded font-medium text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                        >
                            Retry
                        </button>
                    )}
                    <button
                        type="button"
                        ref={(button) => registerRemoveButton(item.id, button)}
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => onRemove(item.id)}
                        className="rounded p-1 text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    >
                        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                            <path
                                d="M5 5l10 10M15 5L5 15"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
                <progress
                    aria-label={`Upload progress for ${item.file.name}`}
                    value={percent}
                    max={100}
                    className={`h-2 w-full appearance-none overflow-hidden rounded-full bg-gray-200 forced-colors:appearance-auto [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300 motion-reduce:[&::-webkit-progress-value]:transition-none ${PROGRESS_COLOR_CLASS[item.status]}`}
                />
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-gray-700">{percent}%</span>
            </div>
            {item.error && <p className="mt-2 text-sm text-red-700">{item.error}</p>}
        </li>
    );
};

// Items are immutable and the callbacks are stable, so a progress update renders only the row whose item changed.
export const FileUploaderRow = memo(FileUploaderRowComponent);

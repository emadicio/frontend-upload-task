import { useCallback, useEffect, useReducer, useRef } from 'react';

import { type UploadFn, type UploadStatus } from './types';

export type UploadItem = {
    id: string;
    file: File;
    status: UploadStatus;
    uploadedBytes: number;
    error?: string;
};

type QueueAction =
    | { type: 'added'; items: UploadItem[] }
    | { type: 'started'; id: string }
    | { type: 'progressed'; id: string; uploadedBytes: number }
    | { type: 'succeeded'; id: string }
    | { type: 'failed'; id: string; error: string }
    | { type: 'retried'; id: string }
    | { type: 'removed'; id: string }
    | { type: 'clearedDone' };

type QueueOptions = {
    onUploaded: (file: File) => void;
    onFailed: (file: File, error: string) => void;
    concurrency?: number;
};

const updateItem = (items: UploadItem[], id: string, changes: Partial<UploadItem>): UploadItem[] =>
    items.map((item) => (item.id === id ? { ...item, ...changes } : item));

const queueReducer = (items: UploadItem[], action: QueueAction): UploadItem[] => {
    switch (action.type) {
        case 'added':
            return [...items, ...action.items];
        case 'started':
            return updateItem(items, action.id, { status: 'uploading' });
        case 'progressed':
            return updateItem(items, action.id, { uploadedBytes: action.uploadedBytes });
        case 'succeeded':
            return updateItem(items, action.id, { status: 'done' });
        case 'failed':
            return updateItem(items, action.id, { status: 'failed', error: action.error });
        case 'retried':
            return updateItem(items, action.id, { status: 'queued', uploadedBytes: 0, error: undefined });
        case 'removed':
            return items.filter((item) => item.id !== action.id);
        case 'clearedDone':
            return items.filter((item) => item.status !== 'done');
    }
};

let nextId = 0;

// 2 files with up to 3 chunks each make 6 requests, the browser's per-host limit on HTTP/1.1.
export const useUploadQueue = (upload: UploadFn, { onUploaded, onFailed, concurrency = 2 }: QueueOptions) => {
    const [items, dispatch] = useReducer(queueReducer, []);
    // A user event can render before the 'started' update lands, so a started file can still look queued.
    // The refs, not the statuses, track which files started and how many are running.
    const controllers = useRef(new Map<string, AbortController>());
    const startedIds = useRef(new Set<string>());

    useEffect(() => {
        const start = (item: UploadItem) => {
            const controller = new AbortController();
            controllers.current.set(item.id, controller);
            startedIds.current.add(item.id);
            dispatch({ type: 'started', id: item.id });
            upload(item.file, {
                signal: controller.signal,
                onProgress: (uploadedBytes) => dispatch({ type: 'progressed', id: item.id, uploadedBytes }),
            }).then(
                () => {
                    controllers.current.delete(item.id);
                    dispatch({ type: 'succeeded', id: item.id });
                    onUploaded(item.file);
                },
                (error: unknown) => {
                    controllers.current.delete(item.id);
                    // An aborted upload was removed on purpose, so it is not a failure.
                    if (controller.signal.aborted) {
                        return;
                    }
                    const message = error instanceof Error ? error.message : 'Upload failed';
                    dispatch({ type: 'failed', id: item.id, error: message });
                    onFailed(item.file, message);
                }
            );
        };

        let runningCount = controllers.current.size;
        for (const item of items) {
            if (runningCount >= concurrency) {
                break;
            }
            if (item.status === 'queued' && !startedIds.current.has(item.id)) {
                start(item);
                runningCount++;
            }
        }
    }, [items, upload, onUploaded, onFailed, concurrency]);

    useEffect(() => {
        const running = controllers.current;
        return () => {
            for (const controller of running.values()) {
                controller.abort();
            }
        };
    }, []);

    const addFiles = useCallback((files: File[]) => {
        const newItems = files.map(
            (file): UploadItem => ({ id: String(nextId++), file, status: 'queued', uploadedBytes: 0 })
        );
        dispatch({ type: 'added', items: newItems });
    }, []);

    const retry = useCallback((id: string) => {
        startedIds.current.delete(id);
        dispatch({ type: 'retried', id });
    }, []);

    const remove = useCallback((id: string) => {
        controllers.current.get(id)?.abort();
        controllers.current.delete(id);
        dispatch({ type: 'removed', id });
    }, []);

    const clearDone = useCallback(() => {
        dispatch({ type: 'clearedDone' });
    }, []);

    return { items, addFiles, retry, remove, clearDone };
};

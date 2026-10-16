/**
 * Returns the error message of a failed response, or a message with the HTTP status.
 * The server sends `{ error }` from the upload endpoints and `{ message }` from the files endpoint.
 */
export const readErrorMessage = async (response: Response, field: 'error' | 'message'): Promise<string> => {
    const body: unknown = await response.json().catch(() => undefined);
    const message = body && typeof body === 'object' ? (body as Record<string, unknown>)[field] : undefined;

    return typeof message === 'string' ? message : `Request failed with HTTP ${response.status}`;
};

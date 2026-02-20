export interface ITranscriptSegment {
    start: number; // seconds
    end: number;
    text: string;
}

export interface ITranscribeResult {
    text: string;
    language: string;
    duration: number | null;
    segments: ITranscriptSegment[];
}

export function useTranscribe() {
    const result = ref<ITranscribeResult | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const uploadProgress = ref(0); // 0–100, driven by XHR progress events

    async function transcribe(file: File): Promise<string | null> {
        loading.value = true;
        error.value = null;
        result.value = null;
        uploadProgress.value = 0;

        try {
            const formData = new FormData();

            formData.append('file', file);

            // Use XHR instead of fetch so we can track upload progress
            const text = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        // Upload counts as first 60% — Whisper processing is the remaining 40%
                        uploadProgress.value = Math.round((e.loaded / e.total) * 60);
                    }
                });

                xhr.addEventListener('load', () => {
                    // Whisper processing done
                    uploadProgress.value = 100;

                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data: ITranscribeResult = JSON.parse(xhr.responseText);

                            result.value = data;
                            resolve(data.text);
                        } catch {
                            reject(new Error('Failed to parse transcription response.'));
                        }
                    } else {
                        try {
                            const err = JSON.parse(xhr.responseText);

                            reject(new Error(err.message || `Server error ${xhr.status}`));
                        } catch {
                            reject(new Error(`Server error ${xhr.status}`));
                        }
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
                xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

                xhr.open('POST', '/api/transcribe');
                xhr.send(formData);

                // Simulate Whisper processing progress (60% → 95%) while waiting
                let fake = 60;
                
                const fakeInterval = setInterval(() => {
                    if (fake < 95) {
                        fake += 2;
                        uploadProgress.value = fake;
                    } else {
                        clearInterval(fakeInterval);
                    }
                }, 400);

                xhr.addEventListener('load', () => clearInterval(fakeInterval));
                xhr.addEventListener('error', () => clearInterval(fakeInterval));
            });

            return text;
        } catch (err: unknown) {
            error.value = (err as Error)?.message || 'Transcription failed.';

            return null;
        } finally {
            loading.value = false;
        }
    }

    function reset() {
        result.value = null;
        error.value = null;
        uploadProgress.value = 0;
    }

    // Format seconds as MM:SS
    function formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;

        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    return { transcribe, result, loading, error, uploadProgress, reset, formatTime };
}

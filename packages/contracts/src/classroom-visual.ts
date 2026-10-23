export type ClassroomVisualPurpose = 'scene' | 'concept' | 'comparison';
export type ClassroomVisualFile = {
    name: string;
    sha256: string;
    size: number;
};
export type ClassroomVisualRecord = {
    id: string;
    ownerUserId: string;
    studentId: string | null;
    sessionId: string;
    stepId: string;
    stepTitle: string;
    stepFingerprint: string;
    requestKey: string;
    inputHash: string;
    purpose: ClassroomVisualPurpose;
    requirements: string;
    prompt: string;
    promptVersion: 'classroom-image-v1';
    modelId: 'gpt-image-2';
    taskId: string;
    revision: number;
    status: 'queued' | 'generating' | 'ready' | 'deleted';
    selectionKey: string | null;
    createdAt: string;
    updatedAt: string;
    files: {
        original: ClassroomVisualFile;
        image: ClassroomVisualFile;
        prompt: ClassroomVisualFile;
    } | null;
    width: number | null;
    height: number | null;
    requests: Array<{
        key: string;
        hash: string;
    }>;
};
export type ClassroomVisualView = Pick<ClassroomVisualRecord, 'id' | 'sessionId' | 'stepId' | 'stepTitle' | 'purpose' | 'requirements' | 'modelId' | 'revision' | 'createdAt' | 'updatedAt' | 'width' | 'height'> & {
    status: 'queued' | 'generating' | 'cancelling' | 'ready' | 'failed' | 'cancelled' | 'deleted';
    selected: boolean;
    contentReview: 'pending';
    imageUrl: string | null;
    sha256: string | null;
    task: {
        state: string;
        version: number;
        generation: number;
        errorCode: string | null;
    } | null;
};
export type ClassroomVisualCapabilities = {
    available: boolean;
    modelId: 'gpt-image-2';
    reason: 'ready' | 'skill_missing' | 'python_unavailable' | 'environment_unavailable';
    message: string;
};

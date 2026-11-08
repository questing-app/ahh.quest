import { apiFetch } from './api'

export const MIN_SECONDS = 15
export const MAX_SECONDS = 60
const FRAME_WIDTH = 480

/** Safari records mp4, Chrome and Firefox record webm. */
export function pickRecorderType(): string {
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
  return candidates.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? ''
}

/** Snapshot whatever the video element is showing as a small JPEG for the verifier. */
export function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * FRAME_WIDTH)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7))
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true })
    target.addEventListener('error', () => reject(new Error('Could not read that video')), { once: true })
  })
}

/** For an uploaded file: read its length and pull one frame per second. */
export async function inspectVideoFile(file: File): Promise<{ duration: number; frames: Blob[] }> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.src = URL.createObjectURL(file)

  try {
    await once(video, 'loadeddata')
    const duration = video.duration
    if (!Number.isFinite(duration)) throw new Error('Could not read the length of that video. Try recording here instead.')

    const frames: Blob[] = []
    for (let t = 0.5; t < Math.min(duration, MAX_SECONDS); t += 1) {
      video.currentTime = t
      await once(video, 'seeked')
      const frame = await grabFrame(video)
      if (frame) frames.push(frame)
    }
    return { duration, frames }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type SendStep = 'video' | 'frames' | 'sign' | 'submit'

export async function sendProof({
  token,
  claimId,
  video,
  frames,
  durationSeconds,
  signProof,
  onStep,
}: {
  token: string
  claimId: string
  video: Blob
  frames: Blob[]
  durationSeconds: number
  /** Records the video's hash on-chain with submit_proof. */
  signProof: (videoHash: string) => Promise<string>
  onStep: (step: SendStep) => void
}) {
  onStep('video')
  const [{ uploadUrl }, videoHash] = await Promise.all([
    apiFetch<{ uploadUrl: string }>('/api/media/upload', {
      token,
      method: 'POST',
      body: video,
      headers: { 'Content-Type': video.type.split(';')[0] || 'video/webm' },
    }),
    sha256Hex(video),
  ])

  onStep('frames')
  const queue = frames.slice(0, MAX_SECONDS).map((frame, index) => ({ frame, index }))
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await apiFetch('/api/media/upload-frame', {
        token,
        method: 'POST',
        body: next.frame,
        headers: { 'x-claim-id': claimId, 'x-frame-index': String(next.index) },
      })
    }
  }
  await Promise.all([worker(), worker(), worker()])

  onStep('sign')
  await signProof(videoHash)

  onStep('submit')
  await apiFetch(`/api/claims/${claimId}/proof`, {
    token,
    json: { videoUrl: uploadUrl, videoHash, durationSeconds: Math.round(durationSeconds) },
  })
}

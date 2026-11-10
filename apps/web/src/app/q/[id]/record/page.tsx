'use client'

import Link from 'next/link'
import { Check, Loader2, SwitchCamera, X } from 'lucide-react'
import { ConfirmButton } from '@/components/confirm-button'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useMe, useQuest, useQuestClaims } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { formatClock, remaining } from '@/lib/time'
import {
  MAX_SECONDS,
  MIN_SECONDS,
  grabFrame,
  inspectVideoFile,
  pickRecorderType,
  sendProof,
  type SendStep,
} from '@/lib/proof'
import { takePickedVideo } from '@/lib/picked-video'
import { button } from '@/components/button'
import { bytesToHex, fetchClaim, hexToBytes, submitProofIx, variant } from '@quest/sdk'
import { program, useSendTransaction, useWallet } from '@/lib/chain'

type Take = { blob: Blob; url: string; duration: number; frames: Blob[]; picked?: boolean }
type Stage = 'setup' | 'live' | 'recording' | 'review' | 'sending'

const STEPS: SendStep[] = ['video', 'frames', 'sign', 'submit']
const STEP_LABELS: Record<SendStep, string> = {
  video: 'Uploading',
  frames: 'Preparing it for the check',
  sign: 'Confirm in your wallet',
  submit: 'Sending your proof',
}

/** Circumference of the ring around the record button. */
const RING = 2 * Math.PI * 35

const closeButton = 'press -ml-2 flex h-11 w-11 items-center justify-center text-paper-raised'

export default function RecordPage() {
  const { id } = useParams<{ id: string }>()
  const quest = useQuest(id)
  const claims = useQuestClaims(id)
  const { data: me } = useMe()
  const { token } = useSession()
  const queryClient = useQueryClient()
  const router = useRouter()
  const sendTransaction = useSendTransaction()
  const { address } = useWallet()

  const claim = claims.data?.find((c) => c.claimerId === me?.id && c.status === 'active')

  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const framesRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const discardRef = useRef(false)

  const [stage, setStage] = useState<Stage>('setup')
  const [facing, setFacing] = useState<'user' | 'environment'>('environment')
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<Take | null>(null)
  const [step, setStep] = useState<SendStep>('video')
  const [error, setError] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stopStream, [stopStream])
  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url)
  }, [take])

  async function startCamera(mode = facing) {
    setError(null)
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 } },
        audio: true,
      })
      streamRef.current = stream
      setStage('live')
      // The <video> mounts with the 'live' stage, so attach on the next frame.
      requestAnimationFrame(() => {
        if (liveRef.current) liveRef.current.srcObject = stream
      })
    } catch {
      setStage('setup')
      setError('Quest needs your camera and microphone. Allow access in your browser settings and try again.')
    }
  }

  function flipCamera() {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    startCamera(next)
  }

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    const type = pickRecorderType()
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    chunksRef.current = []
    framesRef.current = []
    discardRef.current = false

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      stopStream()
      if (discardRef.current) return
      const duration = (performance.now() - startedRef.current) / 1000
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      setTake({ blob, url: URL.createObjectURL(blob), duration, frames: framesRef.current })
      setStage('review')
    }

    recorderRef.current = recorder
    startedRef.current = performance.now()
    recorder.start(1000)
    setElapsed(0)
    setStage('recording')
  }

  // Tick the clock, grab one still per second, and stop at the limit.
  useEffect(() => {
    if (stage !== 'recording') return
    const timer = setInterval(async () => {
      const seconds = (performance.now() - startedRef.current) / 1000
      setElapsed(seconds)
      if (liveRef.current && framesRef.current.length < MAX_SECONDS) {
        const frame = await grabFrame(liveRef.current)
        if (frame) framesRef.current.push(frame)
      }
      if (seconds >= MAX_SECONDS) stopRecording()
    }, 1000)
    return () => clearInterval(timer)
  }, [stage, stopRecording])

  const pickFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const { duration, frames } = await inspectVideoFile(file)
        stopStream()
        setTake({ blob: file, url: URL.createObjectURL(file), duration, frames, picked: true })
        setStage('review')
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [stopStream],
  )

  // "Choose from library" on the quest page hands its file over here.
  useEffect(() => {
    const file = takePickedVideo()
    if (file) pickFile(file)
  }, [pickFile])

  async function submit() {
    if (!take || !claim || !token || !address || !quest.data) return
    const questId = quest.data.onchainId
    setError(null)
    setStep('video')
    setStage('sending')
    try {
      await sendProof({
        token,
        claimId: claim.id,
        video: take.blob,
        frames: take.frames,
        durationSeconds: take.duration,
        signProof: async (videoHash) => {
          // A retry after a failed upload to the API shouldn't sign twice.
          const onChain = await fetchClaim(program, questId, address)
          if (onChain && variant(onChain.status) === 'submitted' && onChain.proofHash && bytesToHex(onChain.proofHash) === videoHash) {
            return 'already-submitted'
          }
          const ix = await submitProofIx(program, { claimer: address, questId, proofHash: hexToBytes(videoHash) })
          return sendTransaction([ix])
        },
        onStep: setStep,
      })
      queryClient.invalidateQueries({ queryKey: ['mine'] })
      // The quest page takes over from here and shows the video as sent.
      await queryClient.invalidateQueries({ queryKey: ['quest', id] })
      router.replace(`/q/${id}`)
    } catch (err) {
      setError(errorMessage(err))
      setStage('review')
    }
  }

  function retake() {
    const wasPicked = take?.picked
    setTake(null)
    setError(null)
    if (wasPicked) setStage('setup')
    else startCamera()
  }

  function discardAndClose() {
    discardRef.current = true
    stopRecording()
    stopStream()
    router.push(`/q/${id}`)
  }

  const tooShort = take ? take.duration < MIN_SECONDS : false
  const tooLong = take ? take.duration > MAX_SECONDS + 1 : false
  const recording = stage === 'recording'
  const locked = recording && elapsed < MIN_SECONDS
  const dare = quest.data?.description

  // ── T2 · The camera fills the screen ──
  if ((stage === 'live' || recording) && claim) {
    return (
      <div className="fixed inset-0 bg-black text-paper-raised">
        <video
          ref={liveRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
        />

        <div className="chrome absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-[env(safe-area-inset-top)]">
          <div className="grid h-11 grid-cols-3 items-center">
            {recording ? (
              <ConfirmButton
                label={<X className="h-7 w-7" strokeWidth={2.25} aria-hidden />}
                ariaLabel="Close"
                question="Stop and throw away this recording?"
                confirmLabel="Discard video"
                className={closeButton}
                onConfirm={discardAndClose}
              />
            ) : (
              <button type="button" aria-label="Close" onClick={discardAndClose} className={closeButton}>
                <X className="h-7 w-7" strokeWidth={2.25} aria-hidden />
              </button>
            )}
            {recording && (
              <p
                className="tabular flex items-center gap-2 justify-self-center rounded-full bg-black/55 px-3 py-1.5 text-[15px] font-semibold"
                role="timer"
                aria-label={`Recording, ${formatClock(elapsed)}`}
              >
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-wax" aria-hidden />
                {formatClock(elapsed)}
              </p>
            )}
          </div>
          {/* The dare stays on screen while filming, like a teleprompter. */}
          <p className="mt-2 line-clamp-3 text-[17px] font-medium leading-snug [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{dare}</p>
        </div>

        <div className="chrome absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-12">
          {error && (
            <p role="alert" className="mb-3 text-center text-[15px] text-[#F0A08C]">
              {error}
            </p>
          )}
          <p className="tabular text-center text-[13px] text-paper-raised/85">
            {recording && !locked
              ? `Tap to stop · stops itself at ${formatClock(MAX_SECONDS)}`
              : `Stop unlocks at ${formatClock(MIN_SECONDS)} · stops itself at ${formatClock(MAX_SECONDS)}`}
          </p>
          <div className="mt-4 grid grid-cols-3 items-center">
            <span />
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={locked}
              aria-label={recording ? (locked ? `Stop unlocks at ${formatClock(MIN_SECONDS)}` : 'Stop recording') : 'Start recording'}
              className="press-scale relative mx-auto flex h-20 w-20 items-center justify-center rounded-full"
            >
              <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="5" strokeOpacity={recording ? 0.3 : 1} />
                {recording && (
                  <circle
                    cx="40"
                    cy="40"
                    r="35"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={RING}
                    strokeDashoffset={RING * (1 - Math.min(elapsed / MIN_SECONDS, 1))}
                    className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                  />
                )}
              </svg>
              <span
                className={`block bg-wax transition-all ${recording ? 'h-7 w-7 rounded-md' : 'h-[58px] w-[58px] rounded-full'} ${
                  locked ? 'opacity-45' : ''
                }`}
              />
            </button>
            {!recording && (
              <button
                type="button"
                onClick={flipCamera}
                aria-label="Flip camera"
                className="press-scale flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-paper-raised/20"
              >
                <SwitchCamera className="h-6 w-6" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-night pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-paper-raised">
      <div className="chrome relative flex h-11 items-center px-4">
        {stage === 'review' ? (
          <>
            <button type="button" onClick={retake} className="press -ml-2 h-11 px-2 text-[17px] text-paper-raised">
              {take?.picked ? 'Choose another' : 'Retake'}
            </button>
            <h1 className="pointer-events-none absolute inset-x-[120px] truncate text-center text-[17px] font-semibold">Check your take</h1>
          </>
        ) : stage === 'sending' ? null : (
          <>
            <Link href={`/q/${id}`} aria-label="Close" className={closeButton}>
              <X className="h-7 w-7" strokeWidth={2.25} aria-hidden />
            </Link>
            {claim && (
              <p className="tabular ml-auto text-[13px] text-paper-raised/70">
                {remaining(claim.proofDeadline) ? `${remaining(claim.proofDeadline)} left to send` : 'Time to send has run out'}
              </p>
            )}
          </>
        )}
      </div>

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pb-8">
        {(quest.isPending || claims.isPending) && <p className="py-10 text-paper-raised/70">Loading…</p>}

        {quest.data && claims.data && !claim && stage !== 'sending' && (
          <div className="py-10">
            <p className="text-[17px]">You don’t have an open attempt on this quest.</p>
            <Link href={`/q/${id}`} className={`${button()} mt-6`}>
              Back to the quest
            </Link>
          </div>
        )}

        {stage === 'setup' && claim && (
          <div className="pt-2">
            <div className="rounded-[16px] bg-black/55 px-4 py-3.5">
              <p className="text-[17px] font-medium leading-snug">{dare}</p>
              <p className="tabular mt-1.5 text-[13px] text-paper-raised/65">
                One take, {MIN_SECONDS}–{MAX_SECONDS} s. Keep the whole thing in frame.
              </p>
            </div>
            <p className="mt-6 text-[17px] leading-relaxed text-paper-raised/85">
              Film it here and it goes straight in. Your camera and microphone turn on when you tap below.
            </p>
            {error && (
              <p role="alert" className="mt-4 text-[15px] text-[#F0A08C]">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-1.5">
              <button type="button" onClick={() => startCamera()} className={`${button()} w-full`}>
                Turn on camera
              </button>
              <label className="press flex h-11 cursor-pointer items-center justify-center text-[17px] text-paper-raised/85">
                Choose from library
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
                />
              </label>
            </div>
          </div>
        )}

        {/* ── T3 · Check your take ── */}
        {stage === 'review' && take && claim && (
          <>
            <video
              src={take.url}
              controls
              playsInline
              className="mt-2 aspect-[9/16] max-h-[56dvh] w-full rounded-[16px] bg-black object-contain"
            />
            <h2 className="tabular mt-4 text-[17px] font-semibold">Your video · {formatClock(take.duration)}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-paper-raised/75">
              Make sure the whole dare is on camera. Once you send it, you can’t swap it.
            </p>
            {(tooShort || tooLong) && (
              <p className="mt-3 text-[15px] text-[#F0A08C]">
                {tooShort
                  ? `That’s ${Math.round(take.duration)} seconds. The video needs at least ${MIN_SECONDS}.`
                  : `That’s ${Math.round(take.duration)} seconds. The video can be ${MAX_SECONDS} at most.`}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-[15px] text-[#F0A08C]">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-1.5">
              <button type="button" onClick={submit} disabled={tooShort || tooLong} className={`${button()} w-full`}>
                {error ? 'Try sending again' : 'Send video'}
              </button>
              <button type="button" onClick={retake} className="press h-11 w-full text-[17px] text-paper-raised/85">
                {take.picked ? 'Choose another video' : 'Retake'}
              </button>
            </div>
          </>
        )}

        {/* ── T4 · Sending ── */}
        {stage === 'sending' && (
          <div className="flex flex-1 flex-col justify-center pb-10">
            <h1 className="font-display text-[30px] leading-tight text-paper-raised">Sending your video</h1>
            <div
              className="mt-5 h-1.5 overflow-hidden rounded-full bg-paper-raised/15"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={STEPS.length}
              aria-valuenow={STEPS.indexOf(step)}
              aria-label="Sending your video"
            >
              <div
                className="h-full rounded-full bg-moss-pale transition-[width] duration-500 ease-out"
                style={{ width: `${((STEPS.indexOf(step) + 0.5) / STEPS.length) * 100}%` }}
              />
            </div>
            <ol className="mt-6 space-y-3.5 text-[17px]" aria-live="polite">
              {STEPS.map((s) => {
                const state = STEPS.indexOf(s) < STEPS.indexOf(step) ? 'done' : s === step ? 'now' : 'later'
                return (
                  <li
                    key={s}
                    className={`flex items-center gap-3 ${state === 'later' ? 'text-paper-raised/45' : ''} ${
                      state === 'now' ? 'font-semibold' : ''
                    }`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
                      {state === 'done' && <Check className="h-5 w-5 text-moss-pale" strokeWidth={3} />}
                      {state === 'now' && <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />}
                      {state === 'later' && <span className="h-1.5 w-1.5 rounded-full bg-paper-raised/45" />}
                    </span>
                    {STEP_LABELS[s]}
                    {state === 'done' && <span className="sr-only"> (done)</span>}
                  </li>
                )
              })}
            </ol>
            <p className="mt-7 text-[13px] leading-relaxed text-paper-raised/65">
              Keep Quest open until this finishes. If it fails, your video is kept and you can try again.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

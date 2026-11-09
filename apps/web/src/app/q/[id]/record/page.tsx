'use client'

import Link from 'next/link'
import { Check, Loader2, SwitchCamera } from 'lucide-react'
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
import { button } from '@/components/button'
import { Timeline } from '@/components/timeline'
import { displayName } from '@/lib/types'
import { bytesToHex, fetchClaim, hexToBytes, submitProofIx, variant } from '@quest/sdk'
import { program, useSendTransaction, useWallet } from '@/lib/chain'

type Take = { blob: Blob; url: string; duration: number; frames: Blob[]; picked?: boolean }
type Stage = 'setup' | 'live' | 'recording' | 'review' | 'sending' | 'sent'

const STEP_LABELS: Record<SendStep, string> = {
  video: 'Uploading your video',
  frames: 'Preparing it for the check',
  sign: 'Confirm in your wallet',
  submit: 'Sending your proof',
}

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

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const duration = (performance.now() - startedRef.current) / 1000
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      setTake({ blob, url: URL.createObjectURL(blob), duration, frames: framesRef.current })
      stopStream()
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

  async function pickFile(file: File) {
    setError(null)
    try {
      const { duration, frames } = await inspectVideoFile(file)
      stopStream()
      setTake({ blob: file, url: URL.createObjectURL(file), duration, frames, picked: true })
      setStage('review')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function submit() {
    if (!take || !claim || !token || !address || !quest.data) return
    const questId = quest.data.onchainId
    setError(null)
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
      queryClient.invalidateQueries({ queryKey: ['quest', id] })
      queryClient.invalidateQueries({ queryKey: ['mine'] })
      setStage('sent')
    } catch (err) {
      setError(errorMessage(err))
      setStage('review')
    }
  }

  function retake() {
    setTake(null)
    startCamera()
  }

  const tooShort = take ? take.duration < MIN_SECONDS : false
  const tooLong = take ? take.duration > MAX_SECONDS + 1 : false

  return (
    <div className="flex min-h-[100dvh] flex-col bg-night pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-paper-raised">
      <div className="chrome flex h-11 items-center justify-between px-4">
        {stage === 'recording' || stage === 'review' ? (
          <div className="-ml-2">
            <ConfirmButton
              label="Close"
              question={stage === 'recording' ? 'Stop and throw away this recording?' : 'Throw away this video?'}
              confirmLabel="Discard video"
              className="press h-11 px-2 text-[17px] text-paper-raised"
              onConfirm={() => {
                stopRecording()
                stopStream()
                router.push(`/q/${id}`)
              }}
            />
          </div>
        ) : (
          <Link href={`/q/${id}`} className="press -ml-2 flex h-11 items-center px-2 text-[17px] text-paper-raised">
            Close
          </Link>
        )}
        {claim && stage !== 'sent' && (
          <p className="text-sm text-paper-raised/70">
            {remaining(claim.proofDeadline) ? `${remaining(claim.proofDeadline)} left to send` : 'Time to send has run out'}
          </p>
        )}
      </div>

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pb-8">
        {(quest.isPending || claims.isPending) && <p className="py-10 text-paper-raised/70">Loading…</p>}

        {quest.data && claims.data && !claim && stage !== 'sent' && (
          <div className="py-10">
            <p className="text-[17px]">You don’t have an open attempt on this quest.</p>
            <Link href={`/q/${id}`} className={`${button()} mt-6`}>
              Back to the quest
            </Link>
          </div>
        )}

        {quest.data && (claim || stage === 'sent') && (
          <>
            {/* The quest stays on screen while filming, like a teleprompter. */}
            {stage !== 'sent' && (
              <div className="rounded-[16px] bg-black/55 px-4 py-3.5">
                <p className="text-[17px] font-medium leading-snug">{quest.data.description}</p>
                <p className="mt-1.5 text-sm text-paper-raised/65">
                  One take, {MIN_SECONDS} to {MAX_SECONDS} seconds. Make sure the whole thing is in frame.
                </p>
              </div>
            )}

            <div className="relative mt-4 flex-1">
              {(stage === 'live' || stage === 'recording') && (
                <video
                  ref={liveRef}
                  autoPlay
                  muted
                  playsInline
                  className={`aspect-[9/16] w-full rounded-[16px] bg-black object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
                />
              )}

              {stage === 'recording' && (
                <p className="tabular absolute left-3 top-3 rounded bg-wax px-2 py-1 text-sm font-semibold">
                  {formatClock(elapsed)} / {formatClock(MAX_SECONDS)}
                </p>
              )}

              {(stage === 'review' || stage === 'sending') && take && (
                <video src={take.url} controls playsInline className="aspect-[9/16] w-full rounded-[16px] bg-black object-contain" />
              )}

              {stage === 'setup' && (
                <div className="py-8">
                  <p className="text-[17px] leading-relaxed text-paper-raised/85">
                    Film it here and it goes straight in. Your camera and microphone turn on when you tap below.
                  </p>
                  <div className="mt-6 flex flex-col gap-3">
                    <button type="button" onClick={() => startCamera()} className={`${button()} w-full`}>
                      Turn on camera
                    </button>
                    <label className="press flex h-11 cursor-pointer items-center justify-center text-[15px] text-paper-raised/80 underline underline-offset-4">
                      Or choose a video you already filmed
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

              {stage === 'sent' && (
                <div className="py-10">
                  <h1 className="font-display text-[34px] leading-tight text-paper-raised">Video sent</h1>
                  <div className="mt-5 rounded-[16px] bg-paper-raised p-4 text-ink">
                    <Timeline
                      stops={[
                        { label: 'Posted', state: 'done' },
                        { label: 'Taken', state: 'done' },
                        { label: 'Video', state: 'done' },
                        { label: 'Paid', state: 'now' },
                      ]}
                    />
                  </div>
                  <p className="mt-5 text-[17px] leading-relaxed text-paper-raised/80">
                    The check usually takes a minute or two. A clear pass pays you the reward plus your deposit. Close
                    calls go to {displayName(quest.data.creator)}, who has 24 hours, or it approves itself.
                  </p>
                  <Link href="/activity" className={`${button()} mt-7 w-full`}>
                    See it in Activity
                  </Link>
                  <Link
                    href={`/q/${id}`}
                    className="press mt-1 flex h-11 w-full items-center justify-center text-[17px] text-paper-raised/85"
                  >
                    Back to the quest
                  </Link>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 text-[15px] text-[#F0A08C]">
                {error}
              </p>
            )}

            {(stage === 'live' || stage === 'recording') && (
              <div className="mt-6 grid grid-cols-3 items-center">
                <span />
                <button
                  type="button"
                  onClick={stage === 'live' ? startRecording : stopRecording}
                  aria-label={stage === 'live' ? 'Start recording' : 'Stop recording'}
                  className="press-scale mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-paper-raised"
                >
                  <span
                    className={`block bg-wax transition-all ${stage === 'recording' ? 'h-7 w-7 rounded-md' : 'h-14 w-14 rounded-full'}`}
                  />
                </button>
                {stage === 'live' ? (
                  <button
                    type="button"
                    onClick={flipCamera}
                    aria-label="Flip camera"
                    className="press-scale flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-paper-raised/15"
                  >
                    <SwitchCamera className="h-6 w-6" aria-hidden />
                  </button>
                ) : (
                  <span className="justify-self-end text-sm text-paper-raised/60">
                    {elapsed < MIN_SECONDS ? `${Math.ceil(MIN_SECONDS - elapsed)}s to minimum` : ''}
                  </span>
                )}
              </div>
            )}

            {stage === 'review' && take && (
              <div className="mt-6">
                {(tooShort || tooLong) && (
                  <p className="mb-4 text-[15px] text-[#F0A08C]">
                    {tooShort
                      ? `That’s ${Math.round(take.duration)} seconds. Proof needs at least ${MIN_SECONDS}.`
                      : `That’s ${Math.round(take.duration)} seconds. Proof can be ${MAX_SECONDS} at most.`}
                  </p>
                )}
                <h2 className="text-[17px] font-semibold">Check your take</h2>
                <ul className="mb-5 mt-2 space-y-2 text-[15px]">
                  <li className="flex items-center gap-2.5">
                    <Check
                      className={`h-5 w-5 shrink-0 ${tooShort || tooLong ? 'text-paper-raised/30' : 'text-moss-pale'}`}
                      strokeWidth={3}
                      aria-hidden
                    />
                    <span className="tabular">
                      {formatClock(take.duration)} long · needs {formatClock(MIN_SECONDS)}–{formatClock(MAX_SECONDS)}
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5 text-paper-raised/80">
                    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-paper-raised/50" />
                    </span>
                    Whole challenge in frame, start to finish?
                  </li>
                </ul>
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={submit} disabled={tooShort || tooLong} className={`${button()} w-full`}>
                    Send this take
                  </button>
                  <button
                    type="button"
                    onClick={take.picked ? () => { setTake(null); setStage('setup') } : retake}
                    className="press h-11 w-full text-[17px] font-semibold text-paper-raised/85"
                  >
                    {take.picked ? 'Choose another video' : 'Retake'}
                  </button>
                </div>
              </div>
            )}

            {stage === 'sending' && (
              <ol className="mt-6 space-y-3 text-[15px]" aria-live="polite">
                {(Object.keys(STEP_LABELS) as SendStep[]).map((s) => {
                  const order: SendStep[] = ['video', 'frames', 'sign', 'submit']
                  const state = order.indexOf(s) < order.indexOf(step) ? 'done' : s === step ? 'now' : 'later'
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
            )}
          </>
        )}
      </main>
    </div>
  )
}

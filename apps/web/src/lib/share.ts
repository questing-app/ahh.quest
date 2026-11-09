import { toast } from '@/components/toast'

/** Native share sheet where there is one, otherwise copy the link. */
export async function shareLink(url: string, text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ url, text })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast('Link copied')
  } catch {
    toast('Couldn’t copy the link')
  }
}

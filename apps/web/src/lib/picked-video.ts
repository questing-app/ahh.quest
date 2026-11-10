// A video chosen from the library on the quest page, handed to the record
// screen. A File can't ride in the URL, so it waits here for one navigation.

let picked: File | null = null

export function stashPickedVideo(file: File) {
  picked = file
}

/** Returns the waiting file once, then forgets it. */
export function takePickedVideo(): File | null {
  const file = picked
  picked = null
  return file
}

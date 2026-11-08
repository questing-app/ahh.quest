// @solana/spl-token reaches for a global Buffer, which Workers only expose
// as an import at this compatibility date. Use the same copy wrangler.toml
// aliases `buffer` to, so every library agrees on what a Buffer is.
import { Buffer } from 'buffer'

globalThis.Buffer ??= Buffer

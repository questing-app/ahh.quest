# Mainnet deploy

Run these on the machine that holds `contracts/.keys/deployer.json` and
`contracts/target/deploy/quest-keypair.json` (the keypair for
`JDWcp8gXX4sypdDc9h8zHVMjM9nTSWxfY16ThnsS7BLM`).

## Before you start

- Deployer holds enough SOL for program rent. Check after building:
  `solana rent $(stat -f%z target/deploy/quest.so)` (macOS) and add ~0.1 SOL for fees.
- A paid mainnet RPC URL (Helius, Triton, QuickNode). The public endpoint rate-limits deploys.
- A **new** oracle keypair for the API: `solana-keygen new -o ~/quest-oracle-mainnet.json`.
  Do not reuse the devnet oracle. It needs ~0.05 SOL for settlement fees.
- A treasury wallet (ideally a multisig). Fees go to its $QUEST token account.
- A new, empty Turso database for mainnet. The API refuses to start against
  a database stamped for another mint.

## 1. Build and test

```bash
cd contracts
anchor build
anchor test                     # localnet
cd .. && pnpm --filter @quest/sdk sync-idl && git diff packages/sdk/src/idl   # should be empty
```

## 2. Upgrade devnet first

The account layouts are unchanged, so devnet quests keep working.

```bash
cd contracts && solana program deploy target/deploy/quest.so \
  --program-id target/deploy/quest-keypair.json --keypair .keys/deployer.json --url devnet
```

Run a quest end to end on ahh.quest (post, claim, submit, settle). Check the
burn happened: the mint's supply drops by the burned share of the fee.

## 3. Deploy to mainnet

```bash
cd contracts
solana program deploy target/deploy/quest.so \
  --program-id target/deploy/quest-keypair.json \
  --keypair .keys/deployer.json \
  --url "$MAINNET_RPC" \
  --with-compute-unit-price 50000 --use-rpc
```

If it stalls, re-run the same command; it resumes from the buffer. If you
abandon it, reclaim the buffer SOL with `solana program close --buffers`.

## 4. Initialize, right away

Only the upgrade authority can initialize, so nobody can front-run this, but
do it straight after deploy anyway.

```bash
SOLANA_RPC_URL="$MAINNET_RPC" \
ORACLE_PUBKEY=$(solana-keygen pubkey ~/quest-oracle-mainnet.json) \
TREASURY=<treasury wallet> FEE_BPS=250 BURN_BPS=5000 \
pnpm --filter @quest/sdk init-mainnet              # dry run, check the printout
# then the same with CONFIRM=yes
```

## 5. Point the app at mainnet

API service:

| var | value |
| --- | --- |
| `SOLANA_RPC_URL` | paid mainnet RPC |
| `QUEST_MINT` | `E7Xfasv5CRTNc6Xb16w36BZk3HRSogh8T4ZFimSnpump` |
| `ORACLE_KEYPAIR` | base64 of the new oracle secret key: `node -e "console.log(Buffer.from(require('$HOME/quest-oracle-mainnet.json')).toString('base64'))"` |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | the new mainnet database (run `pnpm --filter @quest/api db:migrate` against it first) |

Web service:

| var | value |
| --- | --- |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | a mainnet RPC that allows browser origins |
| `NEXT_PUBLIC_QUEST_MINT` | `E7Xfasv5CRTNc6Xb16w36BZk3HRSogh8T4ZFimSnpump` |

The faucet and house accounts switch off by themselves off devnet.

## 6. After

- Move the upgrade authority to a multisig once things look right:
  `solana program set-upgrade-authority JDWc... --new-upgrade-authority <multisig> --skip-new-upgrade-authority-signer-check`.
  After that, `update_config` (oracle, treasury, fees) is signed by the multisig too.
- If the oracle key leaks, rotate it with `updateConfigIx` from the SDK.
